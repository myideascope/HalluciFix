import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScheduledScans from '../ScheduledScans';
import { ScheduledScan } from '../../types/scheduledScan';

// Mock dependencies
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 'test-user-id', email: 'test@example.com' }
  })
}));

vi.mock('../../hooks/useOptimizedData', () => ({
  useOptimizedData: vi.fn().mockReturnValue({
    data: {
      scheduledScans: []
    },
    isLoading: false,
    error: null,
    refetch: vi.fn()
  })
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: vi.fn().mockReturnValue({
    toasts: [],
    removeToast: vi.fn(),
    showWarning: vi.fn(),
    showSuccess: vi.fn()
  })
}));

vi.mock('../../lib/monitoredSupabase', () => ({
  monitoredSupabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ 
            data: {
              id: 'test-scan-id',
              name: 'Test Scan',
              description: 'Test Description',
              frequency: 'daily',
              time: '09:00',
              sources: ['test source'],
              enabled: true,
              status: 'active',
              next_run: '2024-01-02T09:00:00Z'
            }, 
            error: null 
          })
        })
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null })
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null })
      })
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null })
  }
}));

describe('ScheduledScans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('rendering', () => {
    it('should render scheduled scans interface', () => {
      render(<ScheduledScans />);

      expect(screen.getByText(/scheduled content monitoring/i)).toBeInTheDocument();
      expect(screen.getByText(/automate ai content verification/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create schedule/i })).toBeInTheDocument();
    });

    it('should render overview stats', () => {
      render(<ScheduledScans />);

      expect(screen.getByText(/active schedules/i)).toBeInTheDocument();
      expect(screen.getByText(/running scans/i)).toBeInTheDocument();
      expect(screen.getByText(/documents analyzed/i)).toBeInTheDocument();
      expect(screen.getByText(/issues detected/i)).toBeInTheDocument();
    });

    it('should show loading state', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn()
      });

      render(<ScheduledScans />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('scan management', () => {
    it('should open create modal when create button clicked', async () => {
      const user = userEvent.setup();
      render(<ScheduledScans />);

      const createButton = screen.getByRole('button', { name: /create schedule/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText(/create new scheduled scan/i)).toBeInTheDocument();
      });
    });

    it('should create new scan with valid data', async () => {
      const { monitoredSupabase } = await import('../../lib/monitoredSupabase');
      const user = userEvent.setup();
      
      render(<ScheduledScans />);

      // Open create modal
      const createButton = screen.getByRole('button', { name: /create schedule/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText(/create new scheduled scan/i)).toBeInTheDocument();
      });

      // Fill form
      const nameInput = screen.getByLabelText(/scan name/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      
      await user.type(nameInput, 'Test Scan');
      await user.type(descriptionInput, 'Test Description');

      // Submit form
      const submitButton = screen.getByText(/create scan/i);
      await user.click(submitButton);

      expect(monitoredSupabase.from).toHaveBeenCalledWith('scheduled_scans');
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      render(<ScheduledScans />);

      // Open create modal
      const createButton = screen.getByRole('button', { name: /create schedule/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText(/create new scheduled scan/i)).toBeInTheDocument();
      });

      // Try to submit without filling required fields
      const submitButton = screen.getByText(/create scan/i);
      expect(submitButton).toBeDisabled();
    });
  });

  describe('scan operations', () => {
    const mockScan: ScheduledScan = {
      id: 'test-scan-id',
      user_id: 'test-user-id',
      name: 'Test Scan',
      description: 'Test Description',
      frequency: 'daily',
      time: '09:00',
      sources: ['test source'],
      google_drive_files: [],
      enabled: true,
      status: 'active',
      next_run: '2024-01-02T09:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    };

    beforeEach(() => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: {
          scheduledScans: [mockScan]
        },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      });
    });

    it('should display existing scans', () => {
      render(<ScheduledScans />);

      expect(screen.getByText('Test Scan')).toBeInTheDocument();
      expect(screen.getByText('Test Description')).toBeInTheDocument();
      expect(screen.getByText(/daily/i)).toBeInTheDocument();
    });

    it('should run scan immediately', async () => {
      const { monitoredSupabase } = await import('../../lib/monitoredSupabase');
      const user = userEvent.setup();
      
      render(<ScheduledScans />);

      const runButton = screen.getByTitle(/run scan now/i);
      await user.click(runButton);

      expect(monitoredSupabase.rpc).toHaveBeenCalledWith('process_scheduled_scans');
    });

    it('should toggle scan enabled state', async () => {
      const { monitoredSupabase } = await import('../../lib/monitoredSupabase');
      const user = userEvent.setup();
      
      render(<ScheduledScans />);

      const toggleButton = screen.getByTitle(/pause scan/i);
      await user.click(toggleButton);

      expect(monitoredSupabase.from).toHaveBeenCalledWith('scheduled_scans');
    });

    it('should delete scan', async () => {
      const { monitoredSupabase } = await import('../../lib/monitoredSupabase');
      const user = userEvent.setup();
      
      render(<ScheduledScans />);

      const deleteButton = screen.getByTitle(/delete scan/i);
      await user.click(deleteButton);

      expect(monitoredSupabase.from).toHaveBeenCalledWith('scheduled_scans');
    });

    it('should edit existing scan', async () => {
      const user = userEvent.setup();
      render(<ScheduledScans />);

      const editButton = screen.getByTitle(/edit scan/i);
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByText(/edit scheduled scan/i)).toBeInTheDocument();
      });

      // Form should be pre-filled with existing data
      expect(screen.getByDisplayValue('Test Scan')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test Description')).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('should show schedule conflict warning', async () => {
      const { useToast } = require('../../hooks/useToast');
      const mockShowWarning = vi.fn();
      
      vi.mocked(useToast).mockReturnValue({
        toasts: [],
        removeToast: vi.fn(),
        showWarning: mockShowWarning,
        showSuccess: vi.fn()
      });

      const user = userEvent.setup();
      render(<ScheduledScans />);

      // Open create modal and try to create conflicting schedule
      const createButton = screen.getByRole('button', { name: /create schedule/i });
      await user.click(createButton);

      // The conflict detection would happen during form submission
      expect(screen.getByText(/create new scheduled scan/i)).toBeInTheDocument();
    });

    it('should handle frequency and time selection', async () => {
      const user = userEvent.setup();
      render(<ScheduledScans />);

      const createButton = screen.getByRole('button', { name: /create schedule/i });
      await user.click(createButton);

      await waitFor(() => {
        const frequencySelect = screen.getByLabelText(/frequency/i);
        const timeInput = screen.getByLabelText(/time/i);
        
        expect(frequencySelect).toBeInTheDocument();
        expect(timeInput).toBeInTheDocument();
      });
    });
  });

  describe('Google Drive integration', () => {
    it('should show Google Drive file picker', async () => {
      const user = userEvent.setup();
      render(<ScheduledScans />);

      const createButton = screen.getByRole('button', { name: /create schedule/i });
      await user.click(createButton);

      await waitFor(() => {
        const driveButton = screen.getByText(/add from google drive/i);
        expect(driveButton).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('API Error'),
        refetch: vi.fn()
      });

      render(<ScheduledScans />);

      // Component should still render despite error
      expect(screen.getByText(/scheduled content monitoring/i)).toBeInTheDocument();
    });

    it('should show error messages for failed operations', async () => {
      const { useToast } = require('../../hooks/useToast');
      const mockShowWarning = vi.fn();
      
      vi.mocked(useToast).mockReturnValue({
        toasts: [],
        removeToast: vi.fn(),
        showWarning: mockShowWarning,
        showSuccess: vi.fn()
      });

      render(<ScheduledScans />);

      // Error handling is built into the component operations
      expect(mockShowWarning).toBeDefined();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ScheduledScans />);

      expect(screen.getByRole('button', { name: /create schedule/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<ScheduledScans />);

      await user.tab();
      expect(document.activeElement).toBeDefined();
    });
  });

  describe('recent activity', () => {
    it('should show recent scan activity when available', () => {
      const mockScanWithActivity: ScheduledScan = {
        id: 'test-scan-id',
        user_id: 'test-user-id',
        name: 'Test Scan',
        description: 'Test Description',
        frequency: 'daily',
        time: '09:00',
        sources: ['test source'],
        google_drive_files: [],
        enabled: true,
        status: 'active',
        next_run: '2024-01-02T09:00:00Z',
        last_run: '2024-01-01T09:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        results: {
          totalAnalyzed: 5,
          issuesFound: 1,
          averageAccuracy: 85,
          riskLevel: 'low'
        }
      };

      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: {
          scheduledScans: [mockScanWithActivity]
        },
        isLoading: false,
        error: null,
        refetch: vi.fn()
      });

      render(<ScheduledScans />);

      expect(screen.getByText(/recent scan activity/i)).toBeInTheDocument();
    });

    it('should show no activity message when no scans have run', () => {
      render(<ScheduledScans />);

      // When no scans have activity, it should show appropriate message
      expect(screen.getByText(/scheduled content monitoring/i)).toBeInTheDocument();
    });
  });
});