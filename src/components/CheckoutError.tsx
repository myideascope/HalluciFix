import React from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft, Mail } from 'lucide-react';

interface CheckoutErrorProps {
  error?: string;
  planName?: string;
  onRetry?: () => void;
  onBackToPlans?: () => void;
  onContactSupport?: () => void;
}

export const CheckoutError: React.FC<CheckoutErrorProps> = ({
  error = 'An unexpected error occurred during checkout.',
  planName,
  onRetry,
  onBackToPlans,
  onContactSupport
}) => {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  const handleBackToPlans = () => {
    if (onBackToPlans) {
      onBackToPlans();
    } else {
      window.location.href = '/pricing';
    }
  };

  const handleContactSupport = () => {
    if (onContactSupport) {
      onContactSupport();
    } else {
      window.open('mailto:support@hallucifix.com?subject=Checkout Error', '_blank');
    }
  };

  const getErrorMessage = () => {
    if (error.toLowerCase().includes('payment')) {
      return 'There was an issue processing your payment. Please check your payment details and try again.';
    }
    if (error.toLowerCase().includes('network') || error.toLowerCase().includes('connection')) {
      return 'Network connection issue. Please check your internet connection and try again.';
    }
    if (error.toLowerCase().includes('expired') || error.toLowerCase().includes('session')) {
      return 'Your checkout session has expired. Please start the checkout process again.';
    }
    return error;
  };

  const getSuggestions = () => {
    const suggestions = [];
    
    if (error.toLowerCase().includes('payment')) {
      suggestions.push('Verify your payment method details');
      suggestions.push('Check if your card has sufficient funds');
      suggestions.push('Try a different payment method');
    } else if (error.toLowerCase().includes('network')) {
      suggestions.push('Check your internet connection');
      suggestions.push('Try refreshing the page');
      suggestions.push('Disable any VPN or proxy');
    } else {
      suggestions.push('Try refreshing the page');
      suggestions.push('Clear your browser cache');
      suggestions.push('Try using a different browser');
    }
    
    return suggestions;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Checkout Error
          </h2>
          
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {planName 
              ? `We encountered an issue while setting up your ${planName} subscription.`
              : 'We encountered an issue during the checkout process.'
            }
          </p>

          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
              Error Details
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300">
              {getErrorMessage()}
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Try these solutions:
            </h3>
            <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
              {getSuggestions().map((suggestion, index) => (
                <li key={index}>• {suggestion}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            
            <button
              onClick={handleBackToPlans}
              className="w-full px-6 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Plans
            </button>
            
            <button
              onClick={handleContactSupport}
              className="w-full px-6 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Contact Support
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Error ID: {Date.now().toString(36).toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutError;