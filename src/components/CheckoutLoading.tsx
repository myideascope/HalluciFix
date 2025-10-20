import React from 'react';
import { Loader2, CreditCard, Shield, Lock } from 'lucide-react';

interface CheckoutLoadingProps {
  planName?: string;
  message?: string;
}

export const CheckoutLoading: React.FC<CheckoutLoadingProps> = ({
  planName,
  message = 'Preparing your checkout...'
}) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {planName ? `Setting up ${planName}` : 'Processing...'}
          </h2>
          
          <p className="text-slate-600 dark:text-slate-400 mb-8">
            {message}
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-6 text-sm text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Secure</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-green-500" />
                <span>Encrypted</span>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-green-500" />
                <span>PCI Compliant</span>
              </div>
            </div>
            
            <div className="text-xs text-slate-400 dark:text-slate-500">
              You'll be redirected to our secure payment processor
            </div>
          </div>

          {/* Loading animation */}
          <div className="mt-8">
            <div className="flex justify-center space-x-1">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutLoading;