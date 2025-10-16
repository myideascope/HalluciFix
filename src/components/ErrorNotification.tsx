import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  X, 
  Info,
  AlertCircle,
  RefreshCw,
  Home,
  MessageSquare,
  ExternalLink
} from 'lucide-react';
import { ApiError, ErrorSeverity, ErrorActionType, ErrorAction } from '../lib/errors/types';

export interface ErrorNotification {
  id: string;
  error: ApiError;
  dismissed: boolean;
  autoHide: boolean;
  duration?: number;
  actions?: ErrorAction[];
  persistent?: boolean; // For critical errors that shouldn't auto-hide
}

interface ErrorNotificationProps {
  notification: ErrorNotification;
  onClose: (id: string) => void;
  onAction?: (action: ErrorAction, notificationId: string) => void;
}

const ErrorNotificationComponent: React.FC<ErrorNotificationProps> = ({ 
  notification, 
  onClose, 
  onAction 
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const { error, autoHide, duration, actions, persistent } = notification;

  useEffect(() => {
    if (autoHide && !persistent && duration) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose(notification.id), 300); // Allow fade out animation
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [notification.id, autoHide, duration, persistent, onClose]);

  const getSeverityIcon = () => {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        return <XCircle className="w-5 h-5 text-red-600" />;
      case ErrorSeverity.HIGH:
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case ErrorSeverity.MEDIUM:
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case ErrorSeverity.LOW:
        return <Info className="w-5 h-5 text-blue-600" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getSeverityColors = () => {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          text: 'text-red-800 dark:text-red-200',
          accent: 'bg-red-100 dark:bg-red-800'
        };
      case ErrorSeverity.HIGH:
        return {
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-200 dark:border-orange-800',
          text: 'text-orange-800 dark:text-orange-200',
          accent: 'bg-orange-100 dark:bg-orange-800'
        };
      case ErrorSeverity.MEDIUM:
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          text: 'text-yellow-800 dark:text-yellow-200',
          accent: 'bg-yellow-100 dark:bg-yellow-800'
        };
      case ErrorSeverity.LOW:
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          text: 'text-blue-800 dark:text-blue-200',
          accent: 'bg-blue-100 dark:bg-blue-800'
        };
      default:
        return {
          bg: 'bg-gray-50 dark:bg-gray-900/20',
          border: 'border-gray-200 dark:border-gray-800',
          text: 'text-gray-800 dark:text-gray-200',
          accent: 'bg-gray-100 dark:bg-gray-800'
        };
    }
  };

  const getActionIcon = (actionType: ErrorActionType) => {
    switch (actionType) {
      case ErrorActionType.RETRY:
        return <RefreshCw className="w-4 h-4" />;
      case ErrorActionType.REFRESH:
        return <RefreshCw className="w-4 h-4" />;
      case ErrorActionType.GO_HOME:
        return <Home className="w-4 h-4" />;
      case ErrorActionType.CONTACT_SUPPORT:
        return <MessageSquare className="w-4 h-4" />;
      case ErrorActionType.LOGIN:
        return <ExternalLink className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const handleActionClick = (action: ErrorAction) => {
    if (onAction) {
      onAction(action, notification.id);
    }
    action.handler();
  };

  const colors = getSeverityColors();

  return (
    <div 
      className={`
        max-w-md w-full border rounded-lg shadow-lg transition-all duration-300 ease-in-out
        ${colors.bg} ${colors.border} ${colors.text}
        ${isVisible ? 'animate-in slide-in-from-right opacity-100' : 'animate-out slide-out-to-right opacity-0'}
        ${persistent ? 'ring-2 ring-red-500 ring-opacity-50' : ''}
      `}
    >
      {/* Header with severity indicator */}
      <div className={`px-4 py-2 rounded-t-lg ${colors.accent} flex items-center justify-between`}>
        <div className="flex items-center space-x-2">
          {getSeverityIcon()}
          <span className="text-sm font-semibold capitalize">
            {error.severity} Error
          </span>
        </div>
        {!persistent && (
          <button
            onClick={() => onClose(notification.id)}
            className="p-1 hover:bg-black hover:bg-opacity-10 rounded transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start space-x-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium mb-1">
              {error.userMessage}
            </p>
            
            {error.details && (
              <p className="text-xs opacity-75 mb-2">
                {typeof error.details === 'string' ? error.details : JSON.stringify(error.details)}
              </p>
            )}

            {/* Error ID for support */}
            <p className="text-xs opacity-60 font-mono">
              Error ID: {error.errorId}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        {actions && actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action, index) => (
              <button
                key={index}
                onClick={() => handleActionClick(action)}
                className={`
                  inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-md
                  transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2
                  ${action.primary 
                    ? 'bg-white text-gray-900 hover:bg-gray-50 focus:ring-gray-500 shadow-sm border border-gray-300'
                    : 'bg-transparent hover:bg-black hover:bg-opacity-10 focus:ring-gray-500'
                  }
                `}
              >
                {getActionIcon(action.type)}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Retry information */}
        {error.retryable && error.retryAfter && (
          <div className="mt-2 text-xs opacity-75">
            Automatic retry in {Math.ceil(error.retryAfter / 1000)} seconds
          </div>
        )}
      </div>
    </div>
  );
};

interface ErrorNotificationContainerProps {
  notifications: ErrorNotification[];
  onClose: (id: string) => void;
  onAction?: (action: ErrorAction, notificationId: string) => void;
  maxVisible?: number;
}

export const ErrorNotificationContainer: React.FC<ErrorNotificationContainerProps> = ({ 
  notifications, 
  onClose, 
  onAction,
  maxVisible = 5 
}) => {
  // Sort notifications by severity (critical first) and timestamp
  const sortedNotifications = [...notifications]
    .filter(n => !n.dismissed)
    .sort((a, b) => {
      const severityOrder = {
        [ErrorSeverity.CRITICAL]: 0,
        [ErrorSeverity.HIGH]: 1,
        [ErrorSeverity.MEDIUM]: 2,
        [ErrorSeverity.LOW]: 3
      };
      
      const severityDiff = severityOrder[a.error.severity] - severityOrder[b.error.severity];
      if (severityDiff !== 0) return severityDiff;
      
      return new Date(b.error.timestamp).getTime() - new Date(a.error.timestamp).getTime();
    })
    .slice(0, maxVisible);

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-h-screen overflow-y-auto">
      {sortedNotifications.map((notification) => (
        <ErrorNotificationComponent
          key={notification.id}
          notification={notification}
          onClose={onClose}
          onAction={onAction}
        />
      ))}
      
      {notifications.length > maxVisible && (
        <div className="text-center">
          <div className="inline-flex items-center px-3 py-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg">
            +{notifications.length - maxVisible} more notifications
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorNotificationComponent;