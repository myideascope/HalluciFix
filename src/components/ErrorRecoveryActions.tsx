import React, { useState } from 'react';
import {
  RefreshCw,
  Home,
  MessageSquare,
  ExternalLink,
  LogIn,
  AlertTriangle,
  CheckCircle,
  Copy,
  Mail,
  Phone,
  HelpCircle,
  ArrowLeft,
  Settings
} from 'lucide-react';
import { ApiError, ErrorAction, ErrorActionType, ErrorSeverity } from '../lib/errors/types';

interface ErrorRecoveryActionsProps {
  error: ApiError;
  onAction?: (action: ErrorAction) => void;
  className?: string;
}

export const ErrorRecoveryActions: React.FC<ErrorRecoveryActionsProps> = ({
  error,
  onAction,
  className = ''
}) => {
  const [copiedErrorId, setCopiedErrorId] = useState(false);

  const copyErrorId = async () => {
    try {
      await navigator.clipboard.writeText(error.errorId);
      setCopiedErrorId(true);
      setTimeout(() => setCopiedErrorId(false), 2000);
    } catch (err) {
      console.error('Failed to copy error ID:', err);
    }
  };

  const getRecoveryActions = (): ErrorAction[] => {
    const actions: ErrorAction[] = [];

    // Retry action for retryable errors
    if (error.retryable) {
      actions.push({
        type: ErrorActionType.RETRY,
        label: 'Try Again',
        handler: () => {
          window.location.reload();
        },
        primary: true
      });
    }

    // Authentication-specific actions
    if (error.type === 'AUTHENTICATION' || error.type === 'SESSION_EXPIRED') {
      actions.push({
        type: ErrorActionType.LOGIN,
        label: 'Sign In',
        handler: () => {
          window.location.href = '/auth/login';
        },
        primary: true
      });
    }

    // Authorization-specific actions
    if (error.type === 'AUTHORIZATION') {
      actions.push({
        type: ErrorActionType.GO_HOME,
        label: 'Go to Dashboard',
        handler: () => {
          window.location.href = '/dashboard';
        },
        primary: true
      });
    }

    // Network error actions
    if (error.type === 'NETWORK' || error.type === 'CONNECTIVITY') {
      actions.push({
        type: ErrorActionType.REFRESH,
        label: 'Check Connection',
        handler: () => {
          window.location.reload();
        },
        primary: true
      });
    }

    // Server error actions
    if (error.type === 'SERVER' || error.type === 'SERVICE_UNAVAILABLE') {
      actions.push({
        type: ErrorActionType.REFRESH,
        label: 'Refresh Page',
        handler: () => {
          window.location.reload();
        }
      });
    }

    // Critical error actions
    if (error.severity === ErrorSeverity.CRITICAL) {
      actions.push({
        type: ErrorActionType.CONTACT_SUPPORT,
        label: 'Contact Support',
        handler: () => {
          const subject = encodeURIComponent(`Critical Error - ${error.errorId}`);
          const body = encodeURIComponent(
            `Error ID: ${error.errorId}\n` +
            `Error Type: ${error.type}\n` +
            `Message: ${error.message}\n` +
            `Timestamp: ${error.timestamp}\n` +
            `URL: ${window.location.href}\n\n` +
            `Please describe what you were doing when this error occurred:`
          );
          window.open(`mailto:support@hallucifix.com?subject=${subject}&body=${body}`);
        }
      });
    }

    // General navigation actions
    if (error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL) {
      actions.push({
        type: ErrorActionType.GO_HOME,
        label: 'Go Home',
        handler: () => {
          window.location.href = '/';
        }
      });
    }

    return actions;
  };

  const getActionIcon = (actionType: ErrorActionType) => {
    switch (actionType) {
      case ErrorActionType.RETRY:
        return <RefreshCw className="w-4 h-4" />;
      case ErrorActionType.REFRESH:
        return <RefreshCw className="w-4 h-4" />;
      case ErrorActionType.LOGIN:
        return <LogIn className="w-4 h-4" />;
      case ErrorActionType.GO_HOME:
        return <Home className="w-4 h-4" />;
      case ErrorActionType.CONTACT_SUPPORT:
        return <MessageSquare className="w-4 h-4" />;
      case ErrorActionType.DISMISS:
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <ExternalLink className="w-4 h-4" />;
    }
  };

  const handleActionClick = (action: ErrorAction) => {
    if (onAction) {
      onAction(action);
    }
    action.handler();
  };

  const actions = getRecoveryActions();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Primary Actions */}
      {actions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Recovery Actions
          </h4>
          <div className="flex flex-wrap gap-2">
            {actions.map((action, index) => (
              <button
                key={index}
                onClick={() => handleActionClick(action)}
                className={`
                  inline-flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-md
                  transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2
                  ${action.primary
                    ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
                  }
                `}
              >
                {getActionIcon(action.type)}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Details and Support */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Error Information
        </h4>
        
        {/* Error ID with copy functionality */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Error ID:</span>
          <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
            {error.errorId}
          </code>
          <button
            onClick={copyErrorId}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Copy Error ID"
          >
            {copiedErrorId ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Contextual Help */}
        <ErrorContextualHelp error={error} />
      </div>

      {/* Support Contact Options */}
      <ErrorSupportOptions error={error} />
    </div>
  );
};

interface ErrorContextualHelpProps {
  error: ApiError;
}

const ErrorContextualHelp: React.FC<ErrorContextualHelpProps> = ({ error }) => {
  const getHelpContent = () => {
    switch (error.type) {
      case 'NETWORK':
      case 'CONNECTIVITY':
        return {
          title: 'Connection Issues',
          content: [
            'Check your internet connection',
            'Try refreshing the page',
            'Disable VPN or proxy if enabled',
            'Contact your network administrator if the problem persists'
          ]
        };
      
      case 'AUTHENTICATION':
      case 'SESSION_EXPIRED':
        return {
          title: 'Authentication Help',
          content: [
            'Your session may have expired',
            'Try signing in again',
            'Clear your browser cache and cookies',
            'Contact support if you continue having login issues'
          ]
        };
      
      case 'AUTHORIZATION':
        return {
          title: 'Access Permissions',
          content: [
            'You may not have permission for this action',
            'Contact your administrator to request access',
            'Try accessing a different section of the application',
            'Ensure you\'re signed in with the correct account'
          ]
        };
      
      case 'VALIDATION':
        return {
          title: 'Input Validation',
          content: [
            'Check that all required fields are filled',
            'Ensure data formats are correct (email, phone, etc.)',
            'Remove any special characters that might not be allowed',
            'Try submitting with different values'
          ]
        };
      
      case 'SERVER':
      case 'SERVICE_UNAVAILABLE':
        return {
          title: 'Server Issues',
          content: [
            'Our servers are experiencing issues',
            'Try again in a few minutes',
            'Check our status page for updates',
            'Contact support if the issue persists'
          ]
        };
      
      default:
        return {
          title: 'Troubleshooting',
          content: [
            'Try refreshing the page',
            'Clear your browser cache',
            'Try using a different browser',
            'Contact support with the error ID above'
          ]
        };
    }
  };

  const helpContent = getHelpContent();

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
      <div className="flex items-start space-x-2">
        <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        <div>
          <h5 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
            {helpContent.title}
          </h5>
          <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
            {helpContent.content.map((item, index) => (
              <li key={index} className="flex items-start space-x-1">
                <span className="text-blue-400 mt-1">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

interface ErrorSupportOptionsProps {
  error: ApiError;
}

const ErrorSupportOptions: React.FC<ErrorSupportOptionsProps> = ({ error }) => {
  const shouldShowSupport = error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL;

  if (!shouldShowSupport) return null;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
        Need Help?
      </h4>
      <div className="space-y-2">
        <button
          onClick={() => {
            const subject = encodeURIComponent(`Error Report - ${error.errorId}`);
            const body = encodeURIComponent(
              `Error ID: ${error.errorId}\n` +
              `Error Type: ${error.type}\n` +
              `Severity: ${error.severity}\n` +
              `Message: ${error.message}\n` +
              `User Message: ${error.userMessage}\n` +
              `Timestamp: ${error.timestamp}\n` +
              `URL: ${window.location.href}\n` +
              `User Agent: ${navigator.userAgent}\n\n` +
              `Description of what happened:\n`
            );
            window.open(`mailto:support@hallucifix.com?subject=${subject}&body=${body}`);
          }}
          className="flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
        >
          <Mail className="w-4 h-4" />
          <span>Email Support</span>
        </button>
        
        <button
          onClick={() => {
            window.open('https://help.hallucifix.com', '_blank');
          }}
          className="flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
          <span>Help Center</span>
        </button>
        
        {error.severity === ErrorSeverity.CRITICAL && (
          <button
            onClick={() => {
              window.open('tel:+1-555-SUPPORT', '_blank');
            }}
            className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
          >
            <Phone className="w-4 h-4" />
            <span>Emergency Support</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorRecoveryActions;