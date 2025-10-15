import React from 'react';
import { AlertCircle, RefreshCw, Mail, HelpCircle, ArrowLeft } from 'lucide-react';
import { OAuthErrorHandler, RecoveryOption } from '../lib/oauth/oauthErrorHandler';

interface OAuthErrorDisplayProps {
  error: Error | string;
  onRetry?: () => void;
  onUseAlternative?: () => void;
  onContactSupport?: () => void;
  onGoBack?: () => void;
  className?: string;
}

const OAuthErrorDisplay: React.FC<OAuthErrorDisplayProps> = ({
  error,
  onRetry,
  onUseAlternative,
  onContactSupport,
  onGoBack,
  className = ''
}) => {
  const errorInfo = OAuthErrorHandler.mapError(error);
  const recoveryOptions = OAuthErrorHandler.getRecoveryOptions(error);

  const handleRecoveryAction = (option: RecoveryOption) => {
    switch (option.action) {
      case 'retry':
        onRetry?.();
        break;
      case 'use_alternative':
        onUseAlternative?.();
        break;
      case 'contact_support':
        onContactSupport?.();
        break;
      case 'navigate':
        if (option.target) {
          window.location.href = option.target;
        } else {
          onGoBack?.();
        }
        break;
    }
  };

  const getActionIcon = (action: RecoveryOption['action']) => {
    switch (action) {
      case 'retry':
        return <RefreshCw className="w-4 h-4" />;
      case 'use_alternative':
        return <Mail className="w-4 h-4" />;
      case 'contact_support':
        return <HelpCircle className="w-4 h-4" />;
      case 'navigate':
        return <ArrowLeft className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getActionButtonStyle = (action: RecoveryOption['action']) => {
    switch (action) {
      case 'retry':
        return 'bg-blue-600 hover:bg-blue-700 text-white';
      case 'use_alternative':
        return 'bg-slate-600 hover:bg-slate-700 text-white';
      case 'contact_support':
        return 'border border-slate-300 hover:bg-slate-50 text-slate-700';
      case 'navigate':
        return 'border border-slate-300 hover:bg-slate-50 text-slate-700';
      default:
        return 'border border-slate-300 hover:bg-slate-50 text-slate-700';
    }
  };

  return (
    <div className={`bg-white rounded-lg border border-red-200 shadow-sm ${className}`}>
      <div className="p-6">
        {/* Error Header */}
        <div className="flex items-start space-x-3 mb-4">
          <div className="flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {errorInfo.title}
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              {errorInfo.userMessage}
            </p>
          </div>
        </div>

        {/* Recovery Options */}
        {recoveryOptions.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-700 mb-2">
              What would you like to do?
            </h4>
            <div className="flex flex-wrap gap-2">
              {recoveryOptions.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleRecoveryAction(option)}
                  className={`
                    inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium
                    transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    ${getActionButtonStyle(option.action)}
                  `}
                >
                  {getActionIcon(option.action)}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Additional Help */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <details className="group">
            <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700 flex items-center space-x-1">
              <span>Technical Details</span>
              <svg 
                className="w-4 h-4 transition-transform group-open:rotate-180" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-3 rounded border">
              <p><strong>Error Type:</strong> {errorInfo.type}</p>
              <p><strong>Message:</strong> {errorInfo.message}</p>
              <p><strong>Timestamp:</strong> {new Date().toISOString()}</p>
              {errorInfo.shouldRetry && (
                <p><strong>Retry Recommended:</strong> Yes</p>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

export default OAuthErrorDisplay;