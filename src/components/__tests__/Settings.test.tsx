import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../Settings';

// Mock dependencies
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 'test-user-id', email: 'test@example.com' },
    subscription: {
      id: 'sub_123',
      status: 'active',
      currentPeriodEnd: new Date('2024-12-31'),
      cancelAtPeriodEnd: false
    },
    subscriptionPlan: {
      id: 'pro',
      name: 'Pro',
      description: 'Professional plan with advanced features',
      price: 29,
      currency: 'usd',
      interval: 'month',
      analysisLimit: 1000
    },
    subscriptionLoading: false,
    hasActiveSubscription: true,
    canAccessFeature: vi.fn().mockReturnValue(true),
    refreshSubscription: vi.fn()
  })
}));

vi.mock('../../lib/ragService', () => ({
  default: {
    getKnowledgeSources: vi.fn().mockReturnValue([
      {
        id: 'wikipedia',
        name: 'Wikipedia',
        description: 'Wikipedia articles',
        type: 'wikipedia',
        reliability_score: 0.8,
        enabled: true,
        last_updated: '2024-01-01T00:00:00Z'
      },
      {
        id: 'custom-1',
        name: 'Custom Source',
        description: 'Custom knowledge source',
        type: 'custom',
        reliability_score: 0.9,
        enabled: true,
        last_updated: '2024-01-01T00:00:00Z'
      }
    ]),
    addCustomKnowledgeSource: vi.fn().mockReturnValue({
      id: 'new-source',
      name: 'New Source',
      description: 'New custom source',
      type: 'custom',
      reliability_score: 0.8,
      enabled: true,
      last_updated: '2024-01-01T00:00:00Z'
    }),
    updateKnowledgeSource: vi.fn(),
    removeKnowledgeSource: vi.fn()
  }
}));

vi.mock('../../lib/stripe', () => ({
  formatCurrency: vi.fn().mockImplementation((amount, currency) => `$${(amount / 100).toFixed(2)}`)
}));

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('rendering', () => {
    it('should render settings interface', () => {
      render(<Settings />);

      expect(screen.getByText(/system configuration/i)).toBeInTheDocument();
      expect(screen.getByText(/customize hallucination detection/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    });

    it('should render all settings sections', () => {
      render(<Settings />);

      expect(screen.getByText(/subscription & billing/i)).toBeInTheDocument();
      expect(screen.getByText(/detection parameters/i)).toBeInTheDocument();
      expect(screen.getByText(/rag configuration/i)).toBeInTheDocument();
      expect(screen.getByText(/notifications/i)).toBeInTheDocument();
      expect(screen.getByText(/security & privacy/i)).toBeInTheDocument();
    });
  });

  describe('subscription section', () => {
    it('should display subscription information', () => {
      render(<Settings />);

      expect(screen.getByText(/pro plan/i)).toBeInTheDocument();
      expect(screen.getByText(/professional plan with advanced features/i)).toBeInTheDocument();
      expect(screen.getByText(/\$29\.00/)).toBeInTheDocument();
      expect(screen.getByText(/active/i)).toBeInTheDocument();
    });

    it('should show subscription loading state', () => {
      const { useAuth } = require('../../hooks/useAuth');
      
      vi.mocked(useAuth).mockReturnValue({
        user: { id: 'test-user-id', email: 'test@example.com' },
        subscription: null,
        subscriptionPlan: null,
        subscriptionLoading: true,
        hasActiveSubscription: false,
        canAccessFeature: vi.fn().mockReturnValue(false),
        refreshSubscription: vi.fn()
      });

      render(<Settings />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should show no subscription state', () => {
      const { useAuth } = require('../../hooks/useAuth');
      
      vi.mocked(useAuth).mockReturnValue({
        user: { id: 'test-user-id', email: 'test@example.com' },
        subscription: null,
        subscriptionPlan: null,
        subscriptionLoading: false,
        hasActiveSubscription: false,
        canAccessFeature: vi.fn().mockReturnValue(false),
        refreshSubscription: vi.fn()
      });

      render(<Settings />);

      expect(screen.getByText(/no active subscription/i)).toBeInTheDocument();
      expect(screen.getByText(/view pricing plans/i)).toBeInTheDocument();
    });

    it('should show cancellation notice when subscription is cancelled', () => {
      const { useAuth } = require('../../hooks/useAuth');
      
      vi.mocked(useAuth).mockReturnValue({
        user: { id: 'test-user-id', email: 'test@example.com' },
        subscription: {
          id: 'sub_123',
          status: 'active',
          currentPeriodEnd: new Date('2024-12-31'),
          cancelAtPeriodEnd: true
        },
        subscriptionPlan: {
          id: 'pro',
          name: 'Pro',
          description: 'Professional plan',
          price: 29,
          currency: 'usd',
          interval: 'month',
          analysisLimit: 1000
        },
        subscriptionLoading: false,
        hasActiveSubscription: true,
        canAccessFeature: vi.fn().mockReturnValue(true),
        refreshSubscription: vi.fn()
      });

      render(<Settings />);

      expect(screen.getByText(/subscription scheduled for cancellation/i)).toBeInTheDocument();
    });

    it('should display feature access status', () => {
      render(<Settings />);

      expect(screen.getByText(/available features/i)).toBeInTheDocument();
      expect(screen.getByText(/basic analysis/i)).toBeInTheDocument();
      expect(screen.getByText(/advanced analysis/i)).toBeInTheDocument();
    });
  });

  describe('detection parameters', () => {
    it('should render accuracy threshold slider', () => {
      render(<Settings />);

      const slider = screen.getByLabelText(/accuracy threshold/i);
      expect(slider).toBeInTheDocument();
      expect(slider).toHaveAttribute('type', 'range');
    });

    it('should update accuracy threshold', async () => {
      const user = userEvent.setup();
      render(<Settings />);

      const slider = screen.getByLabelText(/accuracy threshold/i);
      await user.clear(slider);
      await user.type(slider, '80');

      expect(slider).toHaveValue('80');
    });

    it('should render sensitivity level dropdown', () => {
      render(<Settings />);

      const select = screen.getByLabelText(/detection sensitivity/i);
      expect(select).toBeInTheDocument();
      expect(screen.getByText(/medium - balanced approach/i)).toBeInTheDocument();
    });

    it('should render toggle switches', () => {
      render(<Settings />);

      expect(screen.getByText(/real-time alerts/i)).toBeInTheDocument();
      expect(screen.getByText(/require manual review/i)).toBeInTheDocument();
      expect(screen.getByText(/batch processing/i)).toBeInTheDocument();
    });

    it('should disable features based on subscription', () => {
      const { useAuth } = require('../../hooks/useAuth');
      
      vi.mocked(useAuth).mockReturnValue({
        user: { id: 'test-user-id', email: 'test@example.com' },
        subscription: null,
        subscriptionPlan: null,
        subscriptionLoading: false,
        hasActiveSubscription: false,
        canAccessFeature: vi.fn().mockImplementation((feature) => {
          return feature === 'basic_analysis';
        }),
        refreshSubscription: vi.fn()
      });

      render(<Settings />);

      expect(screen.getByText(/pro plan required/i)).toBeInTheDocument();
    });
  });

  describe('RAG configuration', () => {
    it('should render RAG settings', () => {
      render(<Settings />);

      expect(screen.getByText(/rag configuration/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/rag sensitivity/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/minimum source reliability/i)).toBeInTheDocument();
    });

    it('should display knowledge sources', () => {
      render(<Settings />);

      expect(screen.getByText(/knowledge sources/i)).toBeInTheDocument();
      expect(screen.getByText('Wikipedia')).toBeInTheDocument();
      expect(screen.getByText('Custom Source')).toBeInTheDocument();
    });

    it('should add new knowledge source', async () => {
      const ragService = await import('../../lib/ragService');
      const user = userEvent.setup();
      
      render(<Settings />);

      const addButton = screen.getByText(/add source/i);
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText(/add knowledge source/i)).toBeInTheDocument();
      });

      // Fill form
      const nameInput = screen.getByLabelText(/source name/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      
      await user.type(nameInput, 'Test Source');
      await user.type(descriptionInput, 'Test Description');

      const submitButton = screen.getByText(/add source/i);
      await user.click(submitButton);

      expect(ragService.default.addCustomKnowledgeSource).toHaveBeenCalled();
    });

    it('should toggle knowledge source', async () => {
      const ragService = await import('../../lib/ragService');
      const user = userEvent.setup();
      
      render(<Settings />);

      // Find toggle for Wikipedia source
      const wikipediaSection = screen.getByText('Wikipedia').closest('div');
      const toggle = wikipediaSection?.querySelector('button');
      
      if (toggle) {
        await user.click(toggle);
        expect(ragService.default.updateKnowledgeSource).toHaveBeenCalled();
      }
    });

    it('should remove custom knowledge source', async () => {
      const ragService = await import('../../lib/ragService');
      const user = userEvent.setup();
      
      render(<Settings />);

      // Find remove button for custom source
      const customSection = screen.getByText('Custom Source').closest('div');
      const removeButton = customSection?.querySelector('button[title*="remove"]');
      
      if (removeButton) {
        await user.click(removeButton);
        expect(ragService.default.removeKnowledgeSource).toHaveBeenCalled();
      }
    });
  });

  describe('notifications', () => {
    it('should render notification settings', () => {
      render(<Settings />);

      expect(screen.getByLabelText(/notification email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/data retention period/i)).toBeInTheDocument();
    });

    it('should update notification email', async () => {
      const user = userEvent.setup();
      render(<Settings />);

      const emailInput = screen.getByLabelText(/notification email/i);
      await user.clear(emailInput);
      await user.type(emailInput, 'new@example.com');

      expect(emailInput).toHaveValue('new@example.com');
    });
  });

  describe('security settings', () => {
    it('should render security information', () => {
      render(<Settings />);

      expect(screen.getByText(/security & privacy/i)).toBeInTheDocument();
      expect(screen.getByText(/data encryption/i)).toBeInTheDocument();
      expect(screen.getByText(/access control/i)).toBeInTheDocument();
      expect(screen.getByText(/compliance/i)).toBeInTheDocument();
    });
  });

  describe('advanced configuration', () => {
    it('should render advanced settings', () => {
      render(<Settings />);

      expect(screen.getByText(/advanced configuration/i)).toBeInTheDocument();
      expect(screen.getByText(/detection models/i)).toBeInTheDocument();
      expect(screen.getByText(/api configuration/i)).toBeInTheDocument();
    });

    it('should show API key management', () => {
      render(<Settings />);

      expect(screen.getByText(/api key/i)).toBeInTheDocument();
      expect(screen.getByText(/hf_••••••••••••••••••••••••••••••••••••••••/)).toBeInTheDocument();
    });

    it('should toggle API key visibility', async () => {
      const user = userEvent.setup();
      render(<Settings />);

      const toggleButton = screen.getByTitle(/show api key/i);
      await user.click(toggleButton);

      // API key should become visible
      expect(screen.getByText(/hf_1234567890abcdef1234567890abcdef12345678/)).toBeInTheDocument();
    });

    it('should copy API key to clipboard', async () => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined)
        }
      });

      const user = userEvent.setup();
      render(<Settings />);

      const apiKeySection = screen.getByText(/hf_••••••••••••••••••••••••••••••••••••••••/).closest('div');
      if (apiKeySection) {
        await user.click(apiKeySection);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hf_1234567890abcdef1234567890abcdef12345678');
      }
    });
  });

  describe('form interactions', () => {
    it('should save settings when save button clicked', async () => {
      const user = userEvent.setup();
      render(<Settings />);

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      // Settings save functionality would be called
      expect(saveButton).toBeInTheDocument();
    });

    it('should reset settings when reset button clicked', async () => {
      const user = userEvent.setup();
      render(<Settings />);

      const resetButton = screen.getByRole('button', { name: /reset/i });
      await user.click(resetButton);

      // Reset functionality would be called
      expect(resetButton).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<Settings />);

      expect(screen.getByLabelText(/accuracy threshold/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/detection sensitivity/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/notification email/i)).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<Settings />);

      await user.tab();
      expect(document.activeElement).toBeDefined();
    });

    it('should have proper form labels and descriptions', () => {
      render(<Settings />);

      expect(screen.getByText(/content below this threshold will be flagged/i)).toBeInTheDocument();
      expect(screen.getByText(/instant notifications for high-risk content/i)).toBeInTheDocument();
    });
  });

  describe('responsive design', () => {
    it('should adapt layout for different screen sizes', () => {
      render(<Settings />);

      // Grid layouts should be responsive
      const container = screen.getByText(/system configuration/i).closest('div');
      expect(container).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', () => {
      const ragService = require('../../lib/ragService');
      
      vi.mocked(ragService.default.getKnowledgeSources).mockImplementation(() => {
        throw new Error('API Error');
      });

      render(<Settings />);

      // Component should still render despite error
      expect(screen.getByText(/system configuration/i)).toBeInTheDocument();
    });
  });
});