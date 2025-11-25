import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, Trash2, Plus, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import PaymentMethodForm from './PaymentMethodForm';

import { logger } from './logging';
interface PaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    funding: string;
  };
  billing_details: {
    name?: string;
    email?: string;
    address?: {
      city?: string;
      country?: string;
      line1?: string;
      line2?: string;
      postal_code?: string;
      state?: string;
    };
  };
  created: number;
  is_default?: boolean;
}

interface PaymentMethodListProps {
  onPaymentMethodChange?: (paymentMethods: PaymentMethod[]) => void;
  allowAdd?: boolean;
  allowDelete?: boolean;
  allowSetDefault?: boolean;
  showBillingAddress?: boolean;
}

export const PaymentMethodList: React.FC<PaymentMethodListProps> = ({
  onPaymentMethodChange,
  allowAdd = true,
  allowDelete = true,
  allowSetDefault = true,
  showBillingAddress = false
}) => {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [processingId, setProcessingId] = useState<string>('');
  const { user } = useAuth();

  const loadPaymentMethods = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      // This would typically call your backend API to get payment methods
      // For now, we'll use mock data or simulate an API call
      const mockPaymentMethods: PaymentMethod[] = [
        {
          id: 'pm_1_mock',
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
            exp_month: 12,
            exp_year: 2025,
            funding: 'credit'
          },
          billing_details: {
            name: 'John Doe',
            email: 'john@example.com',
            address: {
              city: 'San Francisco',
              country: 'US',
              line1: '123 Main St',
              postal_code: '94102'
            }
          },
          created: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
          is_default: true
        }
      ];

      setPaymentMethods(mockPaymentMethods);
      onPaymentMethodChange?.(mockPaymentMethods);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load payment methods';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [onPaymentMethodChange]);

  useEffect(() => {
    if (user) {
      loadPaymentMethods();
    }
  }, [user, loadPaymentMethods]);

  const getAuthToken = async () => {
    // This would get the auth token from your auth system
    return 'mock-token';
  };

  const handleAddPaymentMethod = async (paymentMethod: any) => {
    try {
      setProcessingId('adding');
      
      // Call your backend to save the payment method
      const response = await fetch('/api/payment-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({
          payment_method_id: paymentMethod.id,
          set_as_default: paymentMethods.length === 0, // Set as default if it's the first one
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save payment method');
      }
      
      setShowAddForm(false);
      await loadPaymentMethods();
    } catch (error: any) {
      logger.error("Error adding payment method:", error instanceof Error ? error : new Error(String(error)));
      setError(error.message || 'Failed to add payment method');
    } finally {
      setProcessingId('');
    }
  };

  const handleDeletePaymentMethod = async (paymentMethodId: string) => {
    if (!confirm('Are you sure you want to delete this payment method?')) {
      return;
    }

    try {
      setProcessingId(paymentMethodId);
      
      const response = await fetch(`/api/payment-methods/${paymentMethodId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete payment method');
      }
      
      await loadPaymentMethods();
    } catch (error: any) {
      logger.error("Error deleting payment method:", error instanceof Error ? error : new Error(String(error)));
      setError(error.message || 'Failed to delete payment method');
    } finally {
      setProcessingId('');
    }
  };

  const handleSetDefault = async (paymentMethodId: string) => {
    try {
      setProcessingId(paymentMethodId);
      
      const response = await fetch(`/api/payment-methods/${paymentMethodId}/set-default`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to set default payment method');
      }
      
      await loadPaymentMethods();
    } catch (error: any) {
      logger.error("Error setting default payment method:", error instanceof Error ? error : new Error(String(error)));
      setError(error.message || 'Failed to set default payment method');
    } finally {
      setProcessingId('');
    }
  };

  const getCardIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    switch (brandLower) {
      case 'visa':
        return '💳';
      case 'mastercard':
        return '💳';
      case 'amex':
      case 'american_express':
        return '💳';
      case 'discover':
        return '💳';
      default:
        return '💳';
    }
  };

  const formatCardBrand = (brand: string) => {
    switch (brand.toLowerCase()) {
      case 'amex':
        return 'American Express';
      case 'mastercard':
        return 'Mastercard';
      case 'visa':
        return 'Visa';
      case 'discover':
        return 'Discover';
      default:
        return brand.charAt(0).toUpperCase() + brand.slice(1);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-slate-600 dark:text-slate-400">Loading payment methods...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Payment Methods
        </h3>
        {allowAdd && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Payment Method
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-red-700 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      {showAddForm && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium text-slate-900 dark:text-slate-100">
              Add New Payment Method
            </h4>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              ×
            </button>
          </div>
          
          <PaymentMethodForm
            onSuccess={handleAddPaymentMethod}
            onError={(error) => setError(error)}
            submitButtonText="Add Payment Method"
            showBillingAddress={showBillingAddress}
          />
        </div>
      )}

      {paymentMethods.length === 0 && !showAddForm ? (
        <div className="text-center py-8 bg-slate-50 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
          <CreditCard className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
            No Payment Methods
          </h4>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Add a payment method to manage your subscription and billing.
          </p>
          {allowAdd && (
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Payment Method
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {paymentMethods.map((paymentMethod) => (
            <div
              key={paymentMethod.id}
              className={`bg-white dark:bg-slate-800 border rounded-lg p-4 ${
                paymentMethod.is_default
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="text-2xl">
                    {getCardIcon(paymentMethod.card?.brand || 'card')}
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {formatCardBrand(paymentMethod.card?.brand || 'Card')} •••• {paymentMethod.card?.last4}
                      </span>
                      {paymentMethod.is_default && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-medium rounded-full">
                          <Check className="w-3 h-3" />
                          Default
                        </span>
                      )}
                    </div>
                    
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Expires {paymentMethod.card?.exp_month?.toString().padStart(2, '0')}/{paymentMethod.card?.exp_year}
                      {paymentMethod.billing_details.name && (
                        <span> • {paymentMethod.billing_details.name}</span>
                      )}
                    </div>
                    
                    {showBillingAddress && paymentMethod.billing_details.address && (
                      <div className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                        {paymentMethod.billing_details.address.line1}
                        {paymentMethod.billing_details.address.city && (
                          <span>, {paymentMethod.billing_details.address.city}</span>
                        )}
                        {paymentMethod.billing_details.address.state && (
                          <span>, {paymentMethod.billing_details.address.state}</span>
                        )}
                        {paymentMethod.billing_details.address.postal_code && (
                          <span> {paymentMethod.billing_details.address.postal_code}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {allowSetDefault && !paymentMethod.is_default && (
                    <button
                      onClick={() => handleSetDefault(paymentMethod.id)}
                      disabled={processingId === paymentMethod.id}
                      className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                    >
                      {processingId === paymentMethod.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Set Default'
                      )}
                    </button>
                  )}
                  
                  {allowDelete && (
                    <button
                      onClick={() => handleDeletePaymentMethod(paymentMethod.id)}
                      disabled={processingId === paymentMethod.id}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                      title="Delete payment method"
                    >
                      {processingId === paymentMethod.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PaymentMethodList;