import React, { useState, useEffect } from 'react';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
  PaymentElement,
} from '@stripe/react-stripe-js';
import { CreditCard, Lock, Shield, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { getStripeJs } from '../lib/stripe';
import { subscriptionService } from '../lib/subscriptionService';
import { useAuth } from '../hooks/useAuth';

// Stripe Elements appearance configuration
const stripeElementsOptions = {
  appearance: {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#2563eb',
      colorBackground: '#ffffff',
      colorText: '#1e293b',
      colorDanger: '#dc2626',
      fontFamily: 'system-ui, sans-serif',
      spacingUnit: '4px',
      borderRadius: '8px',
    },
    rules: {
      '.Input': {
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      '.Input:focus': {
        border: '1px solid #2563eb',
        boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.1)',
      },
      '.Input--invalid': {
        border: '1px solid #dc2626',
      },
    },
  },
};

// Dark mode appearance
const darkStripeElementsOptions = {
  appearance: {
    theme: 'night' as const,
    variables: {
      colorPrimary: '#3b82f6',
      colorBackground: '#1e293b',
      colorText: '#f1f5f9',
      colorDanger: '#ef4444',
      fontFamily: 'system-ui, sans-serif',
      spacingUnit: '4px',
      borderRadius: '8px',
    },
    rules: {
      '.Input': {
        border: '1px solid #475569',
        backgroundColor: '#334155',
      },
      '.Input:focus': {
        border: '1px solid #3b82f6',
        boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
      },
      '.Input--invalid': {
        border: '1px solid #ef4444',
      },
    },
  },
};

interface PaymentMethodFormProps {
  onSuccess?: (paymentMethod: any) => void;
  onError?: (error: string) => void;
  submitButtonText?: string;
  showBillingAddress?: boolean;
  clientSecret?: string;
  mode?: 'setup' | 'payment';
}

const PaymentMethodFormContent: React.FC<PaymentMethodFormProps> = ({
  onSuccess,
  onError,
  submitButtonText = 'Save Payment Method',
  showBillingAddress = true,
  clientSecret,
  mode = 'setup'
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [billingDetails, setBillingDetails] = useState({
    name: user?.name || '',
    email: user?.email || '',
    address: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'US',
    },
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      setError('Stripe has not loaded yet. Please try again.');
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
          setError(confirmError.message || 'Payment failed');
          if (onError) onError(confirmError.message || 'Payment failed');
        } else if (paymentIntent?.status === 'succeeded') {
          setSuccess(true);
          if (onSuccess) onSuccess(paymentIntent);
        }
      } else {
        // Handle setup intent for saving payment method
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          setError('Card element not found');
          return;
        }

        // Create payment method
        const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
          billing_details: showBillingAddress ? billingDetails : {
            name: billingDetails.name,
            email: billingDetails.email,
          },
        });

        if (paymentMethodError) {
          setError(paymentMethodError.message || 'Failed to create payment method');
          if (onError) onError(paymentMethodError.message || 'Failed to create payment method');
        } else {
          setSuccess(true);
          if (onSuccess) onSuccess(paymentMethod);
        }
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred';
      setError(errorMessage);
      if (onError) onError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const handleBillingDetailsChange = (field: string, value: string) => {
    if (field.startsWith('address.')) {
      const addressField = field.split('.')[1];
      setBillingDetails(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value,
        },
      }));
    } else {
      setBillingDetails(prev => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
          {mode === 'payment' ? 'Payment Successful!' : 'Payment Method Saved!'}
        </h3>
        <p className="text-slate-600 dark:text-slate-400">
          {mode === 'payment' 
            ? 'Your payment has been processed successfully.'
            : 'Your payment method has been securely saved for future use.'
          }
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Customer Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Payment Information
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={billingDetails.name}
              onChange={(e) => handleBillingDetailsChange('name', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="John Doe"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={billingDetails.email}
              onChange={(e) => handleBillingDetailsChange('email', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="john@example.com"
              required
            />
          </div>
        </div>
      </div>

      {/* Card Element */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Card Details
        </label>
        <div className="p-4 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800">
          {mode === 'payment' && clientSecret ? (
            <PaymentElement />
          ) : (
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: '16px',
                    color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b',
                    backgroundColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
                    '::placeholder': {
                      color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b',
                    },
                  },
                  invalid: {
                    color: '#dc2626',
                  },
                },
              }}
            />
          )}
        </div>
      </div>

      {/* Billing Address */}
      {showBillingAddress && (
        <div className="space-y-4">
          <h4 className="text-md font-medium text-slate-900 dark:text-slate-100">
            Billing Address
          </h4>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Address Line 1
            </label>
            <input
              type="text"
              value={billingDetails.address.line1}
              onChange={(e) => handleBillingDetailsChange('address.line1', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="123 Main Street"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Address Line 2 (Optional)
            </label>
            <input
              type="text"
              value={billingDetails.address.line2}
              onChange={(e) => handleBillingDetailsChange('address.line2', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Apartment, suite, etc."
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                City
              </label>
              <input
                type="text"
                value={billingDetails.address.city}
                onChange={(e) => handleBillingDetailsChange('address.city', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="New York"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                State
              </label>
              <input
                type="text"
                value={billingDetails.address.state}
                onChange={(e) => handleBillingDetailsChange('address.state', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="NY"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                ZIP Code
              </label>
              <input
                type="text"
                value={billingDetails.address.postal_code}
                onChange={(e) => handleBillingDetailsChange('address.postal_code', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="10001"
                required
              />
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">Payment Error</span>
          </div>
          <p className="text-red-700 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Security Notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 mb-2">
          <Shield className="w-5 h-5" />
          <span className="text-sm font-medium">Secure Payment</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-blue-700 dark:text-blue-300">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            SSL Encrypted
          </span>
          <span>PCI Compliant</span>
          <span>256-bit Security</span>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!stripe || processing}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
          processing
            ? 'bg-slate-400 cursor-not-allowed text-white'
            : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
        }`}
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Lock className="w-4 h-4" />
            {submitButtonText}
          </>
        )}
      </button>
    </form>
  );
};

export const PaymentMethodForm: React.FC<PaymentMethodFormProps> = (props) => {
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Initialize Stripe
    setStripePromise(getStripeJs());
    
    // Check for dark mode
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    
    checkDarkMode();
    
    // Listen for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    
    return () => observer.disconnect();
  }, []);

  if (!stripePromise) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-slate-600 dark:text-slate-400">Loading payment form...</span>
      </div>
    );
  }

  return (
    <Elements 
      stripe={stripePromise} 
      options={{
        ...isDarkMode ? darkStripeElementsOptions : stripeElementsOptions,
        clientSecret: props.clientSecret,
      }}
    >
      <PaymentMethodFormContent {...props} />
    </Elements>
  );
};

export default PaymentMethodForm;