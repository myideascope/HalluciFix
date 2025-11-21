import { useState, useEffect, useCallback } from 'react';
import { useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from './useAuth';

interface UseStripeElementsOptions {
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  mode?: 'setup' | 'payment';
}

interface PaymentMethodData {
  name: string;
  email: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

export const useStripeElements = (options?: UseStripeElementsOptions) => {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [clientSecret, setClientSecret] = useState<string>('');

  const { onSuccess, onError, mode = 'setup' } = options || {};

  // Create setup intent for saving payment methods
  const createSetupIntent = useCallback(async () => {
    if (!user) {
      setError('User must be logged in');
      return;
    }

    try {
      const response = await fetch('/api/create-setup-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({
          customer_id: user.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create setup intent');
      }

      const data = await response.json();
      setClientSecret(data.client_secret);
      return data.client_secret;
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to create setup intent';
      setError(errorMessage);
      if (onError) onError(errorMessage);
      throw error;
    }
  }, [user, onError]);

  // Create payment intent for processing payments
  const createPaymentIntent = useCallback(async (amount: number, currency: string = 'usd') => {
    if (!user) {
      setError('User must be logged in');
      return;
    }

    try {
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({
          amount,
          currency,
          customer_id: user.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }

      const data = await response.json();
      setClientSecret(data.client_secret);
      return data.client_secret;
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to create payment intent';
      setError(errorMessage);
      if (onError) onError(errorMessage);
      throw error;
    }
  }, [user, onError]);

  // Submit payment method
  const submitPaymentMethod = useCallback(async (paymentMethodData: PaymentMethodData) => {
    if (!stripe || !elements) {
      setError('Stripe has not loaded yet');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      if (mode === 'payment' && clientSecret) {
        // Handle payment confirmation
        const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}/billing/success`,
          },
          redirect: 'if_required',
        });

        if (confirmError) {
          throw new Error(confirmError.message || 'Payment failed');
        }

        if (paymentIntent?.status === 'succeeded') {
          setSuccess(true);
          if (onSuccess) onSuccess(paymentIntent);
          return paymentIntent;
        }
      } else {
        // Handle setup intent for saving payment method
        const cardElement = elements.getElement('card');
        if (!cardElement) {
          throw new Error('Card element not found');
        }

        // Create payment method
        const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
          billing_details: {
            name: paymentMethodData.name,
            email: paymentMethodData.email,
            address: paymentMethodData.address,
          },
        });

        if (paymentMethodError) {
          throw new Error(paymentMethodError.message || 'Failed to create payment method');
        }

        // If we have a setup intent, confirm it
        if (clientSecret) {
          const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(
            clientSecret,
            {
              payment_method: paymentMethod.id,
            }
          );

          if (confirmError) {
            throw new Error(confirmError.message || 'Failed to save payment method');
          }

          setSuccess(true);
          if (onSuccess) onSuccess({ paymentMethod, setupIntent });
          return { paymentMethod, setupIntent };
        } else {
          // Just return the payment method without confirming setup intent
          setSuccess(true);
          if (onSuccess) onSuccess(paymentMethod);
          return paymentMethod;
        }
      }
    } catch (error: any) {
      const errorMessage = error.message || 'An unexpected error occurred';
      setError(errorMessage);
      if (onError) onError(errorMessage);
      throw error;
    } finally {
      setProcessing(false);
    }
  }, [stripe, elements, mode, clientSecret, onSuccess, onError]);

  // Reset state
  const reset = useCallback(() => {
    setProcessing(false);
    setError('');
    setSuccess(false);
    setClientSecret('');
  }, []);

  // Get auth token helper
  const getAuthToken = async () => {
    // This would get the auth token from your auth system
    return 'mock-token';
  };

  // Auto-create setup intent when component mounts in setup mode
  useEffect(() => {
    if (mode === 'setup' && user && !clientSecret) {
      createSetupIntent().catch(console.error);
    }
  }, [mode, user, clientSecret, createSetupIntent]);

  return {
    // State
    processing,
    error,
    success,
    clientSecret,
    isReady: !!stripe && !!elements,
    
    // Actions
    submitPaymentMethod,
    createSetupIntent,
    createPaymentIntent,
    reset,
    
    // Utilities
    setError,
    setProcessing,
  };
};

export default useStripeElements;