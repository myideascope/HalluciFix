import React, { useState, useEffect } from 'react';
import { CreditCard, Shield, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import PaymentMethodList from './PaymentMethodList';
import PaymentMethodForm from './PaymentMethodForm';
import { useAuth } from '../hooks/useAuth';

interface PaymentMethodManagerProps {
  mode?: 'setup' | 'manage';
  onPaymentMethodAdded?: (paymentMethod: any) => void;
  onPaymentMethodsChange?: (paymentMethods: any[]) => void;
  showBillingAddress?: boolean;
  allowMultiple?: boolean;
  title?: string;
  description?: string;
}

export const PaymentMethodManager: React.FC<PaymentMethodManagerProps> = ({
  mode = 'manage',
  onPaymentMethodAdded,
  onPaymentMethodsChange,
  showBillingAddress = true,
  allowMultiple = true,
  title,
  description
}) => {
  const [currentView, setCurrentView] = useState<'list' | 'add'>('list');
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [setupIntent, setSetupIntent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const { user } = useAuth();

  const createSetupIntent = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch('/api/create-setup-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.id}`
        },
        body: JSON.stringify({
          userId: user?.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create setup intent');
      }

      const data = await response.json();
      setSetupIntent(data.clientSecret);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create setup intent';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'setup' && user) {
      createSetupIntent();
    }
  }, [mode, user, createSetupIntent]);

  const getAuthToken = async () => {
    // This would get the auth token from your auth system
    return 'mock-token';
  };

  const handlePaymentMethodAdded = (paymentMethod: any) => {
    if (onPaymentMethodAdded) {
      onPaymentMethodAdded(paymentMethod);
    }
    
    if (mode === 'setup') {
      // In setup mode, we might want to close or redirect after adding
      return;
    }
    
    // In manage mode, go back to list view
    setCurrentView('list');
  };

  const handlePaymentMethodsChange = (methods: any[]) => {
    setPaymentMethods(methods);
    if (onPaymentMethodsChange) {
      onPaymentMethodsChange(methods);
    }
  };

  const getTitle = () => {
    if (title) return title;
    
    switch (mode) {
      case 'setup':
        return 'Set Up Payment Method';
      case 'manage':
        return 'Manage Payment Methods';
      default:
        return 'Payment Methods';
    }
  };

  const getDescription = () => {
    if (description) return description;
    
    switch (mode) {
      case 'setup':
        return 'Add a payment method to complete your subscription setup. Your information is secure and encrypted.';
      case 'manage':
        return 'Add, remove, or update your payment methods. Set a default method for automatic billing.';
      default:
        return 'Manage your payment methods securely.';
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3 mb-8"></div>
          <div className="space-y-4">
            <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {getTitle()}
          </h2>
        </div>
        
        <p className="text-slate-600 dark:text-slate-400">
          {getDescription()}
        </p>
      </div>

      {/* Security Notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 mb-2">
          <Shield className="w-5 h-5" />
          <span className="font-medium">Your payment information is secure</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-blue-700 dark:text-blue-300">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            256-bit SSL encryption
          </span>
          <span>PCI DSS compliant</span>
          <span>SOC 2 certified</span>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-red-700 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Content */}
      {mode === 'setup' ? (
        // Setup mode: Show form directly
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <PaymentMethodForm
            onSuccess={handlePaymentMethodAdded}
            onError={setError}
            submitButtonText="Save Payment Method"
            showBillingAddress={showBillingAddress}
            clientSecret={setupIntent}
            mode="setup"
          />
        </div>
      ) : (
        // Manage mode: Show list with ability to add
        <PaymentMethodList
          onPaymentMethodChange={handlePaymentMethodsChange}
          allowAdd={allowMultiple || paymentMethods.length === 0}
          allowDelete={true}
          allowSetDefault={true}
          showBillingAddress={showBillingAddress}
        />
      )}

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-center space-x-6 text-sm text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Secure payments
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            No hidden fees
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Cancel anytime
          </span>
        </div>
        
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
          Powered by Stripe. Your payment information is processed securely and never stored on our servers.
        </p>
      </div>
    </div>
  );
};

export default PaymentMethodManager;