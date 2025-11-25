import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import PaymentMethodForm from '../PaymentMethodForm';

// Mock Stripe
const mockStripe = {
  createPaymentMethod: vi.fn(),
  confirmPayment: vi.fn(),
};

const mockElements = {
  getElement: vi.fn(),
};

const mockCardElement = {
  mount: vi.fn(),
  unmount: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardElement: () => <div data-testid="card-element">Card Element</div>,
  PaymentElement: () => <div data-testid="payment-element">Payment Element</div>,
  useStripe: () => mockStripe,
  useElements: () => mockElements,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { 
      id: 'test-user-id', 
      email: 'test@example.com',
      name: 'Test User'
    }
  })
}));

vi.mock('../../lib/stripe', () => ({
  getStripeJs: vi.fn().mockResolvedValue(mockStripe)
}));

vi.mock('../../lib/subscriptionService', () => ({
  subscriptionService: {
    createPaymentMethod: vi.fn(),
    attachPaymentMethod: vi.fn()
  }
}));

describe('PaymentMethodForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElements.getElement.mockReturnValue(mockCardElement);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('rendering', () => {
    it('should render payment form interface', async () => {
      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByText(/payment information/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(screen.getByTestId('card-element')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      render(<PaymentMethodForm />);

      expect(screen.getByText(/loading payment form/i)).toBeInTheDocument();
    });

    it('should render billing address fields when enabled', async () => {
      render(<PaymentMethodForm showBillingAddress={true} />);

      await waitFor(() => {
        expect(screen.getByText(/billing address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/address line 1/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/zip code/i)).toBeInTheDocument();
      });
    });

    it('should hide billing address when disabled', async () => {
      render(<PaymentMethodForm showBillingAddress={false} />);

      await waitFor(() => {
        expect(screen.queryByText(/billing address/i)).not.toBeInTheDocument();
      });
    });

    it('should render PaymentElement in payment mode', async () => {
      render(<PaymentMethodForm mode="payment" clientSecret="pi_test_123" />);

      await waitFor(() => {
        expect(screen.getByTestId('payment-element')).toBeInTheDocument();
      });
    });
  });

  describe('form interactions', () => {
    it('should update form fields', async () => {
      const user = userEvent.setup();
      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email address/i);

      await user.clear(nameInput);
      await user.type(nameInput, 'John Doe');
      await user.clear(emailInput);
      await user.type(emailInput, 'john@example.com');

      expect(nameInput).toHaveValue('John Doe');
      expect(emailInput).toHaveValue('john@example.com');
    });

    it('should update billing address fields', async () => {
      const user = userEvent.setup();
      render(<PaymentMethodForm showBillingAddress={true} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/address line 1/i)).toBeInTheDocument();
      });

      const addressInput = screen.getByLabelText(/address line 1/i);
      const cityInput = screen.getByLabelText(/city/i);

      await user.type(addressInput, '123 Main St');
      await user.type(cityInput, 'New York');

      expect(addressInput).toHaveValue('123 Main St');
      expect(cityInput).toHaveValue('New York');
    });

    it('should pre-fill user information', async () => {
      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
        expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
      });
    });
  });

  describe('form submission', () => {
    it('should create payment method on form submission', async () => {
      const mockOnSuccess = vi.fn();
      const user = userEvent.setup();

      mockStripe.createPaymentMethod.mockResolvedValue({
        paymentMethod: {
          id: 'pm_test_123',
          type: 'card'
        },
        error: null
      });

      render(<PaymentMethodForm onSuccess={mockOnSuccess} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      expect(mockStripe.createPaymentMethod).toHaveBeenCalledWith({
        type: 'card',
        card: mockCardElement,
        billing_details: expect.objectContaining({
          name: 'Test User',
          email: 'test@example.com'
        })
      });
    });

    it('should handle payment confirmation in payment mode', async () => {
      const mockOnSuccess = vi.fn();
      const user = userEvent.setup();

      mockStripe.confirmPayment.mockResolvedValue({
        paymentIntent: {
          id: 'pi_test_123',
          status: 'succeeded'
        },
        error: null
      });

      render(
        <PaymentMethodForm 
          mode="payment" 
          clientSecret="pi_test_123"
          onSuccess={mockOnSuccess} 
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      expect(mockStripe.confirmPayment).toHaveBeenCalledWith({
        elements: mockElements,
        confirmParams: {
          return_url: expect.stringContaining('/billing/success')
        },
        redirect: 'if_required'
      });
    });

    it('should call onSuccess callback on successful submission', async () => {
      const mockOnSuccess = vi.fn();
      const user = userEvent.setup();

      mockStripe.createPaymentMethod.mockResolvedValue({
        paymentMethod: {
          id: 'pm_test_123',
          type: 'card'
        },
        error: null
      });

      render(<PaymentMethodForm onSuccess={mockOnSuccess} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith({
          id: 'pm_test_123',
          type: 'card'
        });
      });
    });

    it('should show success state after successful submission', async () => {
      const user = userEvent.setup();

      mockStripe.createPaymentMethod.mockResolvedValue({
        paymentMethod: {
          id: 'pm_test_123',
          type: 'card'
        },
        error: null
      });

      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/payment method saved!/i)).toBeInTheDocument();
        expect(screen.getByText(/securely saved for future use/i)).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should display error when Stripe is not loaded', async () => {
      const mockUseStripe = vi.fn().mockReturnValue(null);
      vi.mocked(require('@stripe/react-stripe-js').useStripe).mockImplementation(mockUseStripe);

      const user = userEvent.setup();
      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/stripe has not loaded yet/i)).toBeInTheDocument();
      });
    });

    it('should handle payment method creation errors', async () => {
      const mockOnError = vi.fn();
      const user = userEvent.setup();

      mockStripe.createPaymentMethod.mockResolvedValue({
        paymentMethod: null,
        error: {
          message: 'Your card was declined.'
        }
      });

      render(<PaymentMethodForm onError={mockOnError} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/your card was declined/i)).toBeInTheDocument();
        expect(mockOnError).toHaveBeenCalledWith('Your card was declined.');
      });
    });

    it('should handle payment confirmation errors', async () => {
      const mockOnError = vi.fn();
      const user = userEvent.setup();

      mockStripe.confirmPayment.mockResolvedValue({
        paymentIntent: null,
        error: {
          message: 'Payment failed'
        }
      });

      render(
        <PaymentMethodForm 
          mode="payment" 
          clientSecret="pi_test_123"
          onError={mockOnError} 
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/payment failed/i)).toBeInTheDocument();
        expect(mockOnError).toHaveBeenCalledWith('Payment failed');
      });
    });

    it('should handle missing card element error', async () => {
      const user = userEvent.setup();

      mockElements.getElement.mockReturnValue(null);

      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/card element not found/i)).toBeInTheDocument();
      });
    });
  });

  describe('loading states', () => {
    it('should show processing state during submission', async () => {
      const user = userEvent.setup();

      // Make the promise never resolve to keep loading state
      mockStripe.createPaymentMethod.mockReturnValue(new Promise(() => {}));

      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      expect(screen.getByText(/processing/i)).toBeInTheDocument();
      expect(submitButton).toBeDisabled();
    });

    it('should disable submit button when processing', async () => {
      const user = userEvent.setup();

      mockStripe.createPaymentMethod.mockReturnValue(new Promise(() => {}));

      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      expect(submitButton).toBeDisabled();
    });
  });

  describe('security features', () => {
    it('should display security information', async () => {
      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByText(/secure payment/i)).toBeInTheDocument();
        expect(screen.getByText(/ssl encrypted/i)).toBeInTheDocument();
        expect(screen.getByText(/pci compliant/i)).toBeInTheDocument();
        expect(screen.getByText(/256-bit security/i)).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have proper form labels', async () => {
      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/card details/i)).toBeInTheDocument();
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      });

      await user.tab();
      expect(screen.getByLabelText(/full name/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/email address/i)).toHaveFocus();
    });

    it('should have proper ARIA attributes for errors', async () => {
      const user = userEvent.setup();

      mockStripe.createPaymentMethod.mockResolvedValue({
        paymentMethod: null,
        error: {
          message: 'Card error'
        }
      });

      render(<PaymentMethodForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/payment error/i)).toBeInTheDocument();
      });
    });
  });

  describe('custom props', () => {
    it('should use custom submit button text', async () => {
      render(<PaymentMethodForm submitButtonText="Add Payment Method" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add payment method/i })).toBeInTheDocument();
      });
    });

    it('should handle different success messages for payment vs setup mode', async () => {
      const user = userEvent.setup();

      mockStripe.confirmPayment.mockResolvedValue({
        paymentIntent: {
          id: 'pi_test_123',
          status: 'succeeded'
        },
        error: null
      });

      render(<PaymentMethodForm mode="payment" clientSecret="pi_test_123" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save payment method/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /save payment method/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/payment successful!/i)).toBeInTheDocument();
        expect(screen.getByText(/processed successfully/i)).toBeInTheDocument();
      });
    });
  });
});