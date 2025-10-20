import React from 'react';
import { XCircle, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';

interface CheckoutCancelProps {
  onRetry?: () => void;
  onBackToPlans?: () => void;
  onContinueWithoutPlan?: () => void;
  planName?: string;
}

export const CheckoutCancel: React.FC<CheckoutCancelProps> = ({
  onRetry,
  onBackToPlans,
  onContinueWithoutPlan,
  planName
}) => {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      // Default: go back to pricing page
      window.location.href = '/pricing';
    }
  };

  const handleBackToPlans = () => {
    if (onBackToPlans) {
      onBackToPlans();
    } else {
      window.location.href = '/pricing';
    }
  };

  const handleContinueWithoutPlan = () => {
    if (onContinueWithoutPlan) {
      onContinueWithoutPlan();
    } else {
      window.location.href = '/dashboard';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Checkout Cancelled
          </h2>
          
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {planName 
              ? `Your ${planName} subscription setup was cancelled. No charges were made to your account.`
              : 'Your subscription setup was cancelled. No charges were made to your account.'
            }
          </p>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
              What happens next?
            </h3>
            <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1 text-left">
              <li>• You can continue using HalluciFix with free features</li>
              <li>• Your account remains active and secure</li>
              <li>• You can upgrade to a paid plan anytime</li>
              <li>• All your data and settings are preserved</li>
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
              View All Plans
            </button>
            
            <button
              onClick={handleContinueWithoutPlan}
              className="w-full px-6 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center justify-center gap-2"
            >
              Continue with Free Plan
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Need help? Contact our support team at{' '}
              <a 
                href="mailto:support@hallucifix.com" 
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@hallucifix.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutCancel;