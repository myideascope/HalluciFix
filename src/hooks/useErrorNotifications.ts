import { useState, useCallback, useRef, useEffect } from 'react';
import { ApiError, ErrorSeverity, ErrorAction, ErrorActionType } from '../lib/errors/types';
import { ErrorNotification } from '../components/ErrorNotification';

interface ErrorNotificationConfig {
  autoHide?: boolean;
  duration?: number;
  persistent?: boolean;
  actions?: ErrorAction[];
}

interface UseErrorNotificationsOptions {
  maxNotifications?: number;
  defaultDuration?: number;
  persistCritical?: boolean;
}

export const useErrorNotifications = (options: UseErrorNotificationsOptions = {}) => {
  const {
    maxNotifications = 10,
    defaultDuration = 5000,
    persistCritical = true
  } = options;

  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);
  const notificationIdRef = useRef(0);

  // Auto-cleanup dismissed notifications
  useEffect(() => {
    const cleanup = setInterval(() => {
      setNotifications(prev => prev.filter(n => !n.dismissed));
    }, 60000); // Clean up every minute

    return () => clearInterval(cleanup);
  }, []);

  const generateNotificationId = useCallback(() => {
    return `error-notification-${++notificationIdRef.current}-${Date.now()}`;
  }, []);

  const getDefaultActions = useCallback((error: ApiError): ErrorAction[] => {
    const actions: ErrorAction[] = [];

    // Add retry action for retryable errors
    if (error.retryable) {
      actions.push({
        type: ErrorActionType.RETRY,
        label: 'Retry',
        handler: () => {
          // This will be overridden by the caller if needed
          window.location.reload();
        },
        primary: true
      });
    }

    // Add authentication actions for auth errors
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

    // Add refresh action for server errors
    if (error.type === 'SERVER' || error.type === 'SERVICE_UNAVAILABLE') {
      actions.push({
        type: ErrorActionType.REFRESH,
        label: 'Refresh Page',
        handler: () => {
          window.location.reload();
        }
      });
    }

    // Add contact support for critical errors
    if (error.severity === ErrorSeverity.CRITICAL) {
      actions.push({
        type: ErrorActionType.CONTACT_SUPPORT,
        label: 'Contact Support',
        handler: () => {
          window.open('mailto:support@hallucifix.com?subject=Critical Error&body=' + 
            encodeURIComponent(`Error ID: ${error.errorId}\nMessage: ${error.message}`));
        }
      });
    }

    // Add go home action for navigation errors
    if (error.type === 'AUTHORIZATION' || error.severity === ErrorSeverity.HIGH) {
      actions.push({
        type: ErrorActionType.GO_HOME,
        label: 'Go Home',
        handler: () => {
          window.location.href = '/';
        }
      });
    }

    return actions;
  }, []);

  const getNotificationConfig = useCallback((error: ApiError): ErrorNotificationConfig => {
    const isCritical = error.severity === ErrorSeverity.CRITICAL;
    const isHigh = error.severity === ErrorSeverity.HIGH;
    
    return {
      autoHide: !isCritical && !(persistCritical && isHigh),
      duration: isCritical ? undefined : (
        isHigh ? defaultDuration * 2 : defaultDuration
      ),
      persistent: isCritical && persistCritical,
      actions: getDefaultActions(error)
    };
  }, [defaultDuration, persistCritical, getDefaultActions]);

  const addErrorNotification = useCallback((
    error: ApiError, 
    config: Partial<ErrorNotificationConfig> = {}
  ): string => {
    const id = generateNotificationId();
    const defaultConfig = getNotificationConfig(error);
    const finalConfig = { ...defaultConfig, ...config };

    const notification: ErrorNotification = {
      id,
      error,
      dismissed: false,
      autoHide: finalConfig.autoHide ?? true,
      duration: finalConfig.duration,
      persistent: finalConfig.persistent,
      actions: finalConfig.actions
    };

    setNotifications(prev => {
      // Remove oldest notifications if we exceed the limit
      const newNotifications = [...prev, notification];
      if (newNotifications.length > maxNotifications) {
        return newNotifications.slice(-maxNotifications);
      }
      return newNotifications;
    });

    return id;
  }, [generateNotificationId, getNotificationConfig, maxNotifications]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, dismissed: true } : n)
    );
    
    // Actually remove after a delay to allow animation
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 300);
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, dismissed: true }))
    );
    
    setTimeout(() => {
      setNotifications([]);
    }, 300);
  }, []);

  const clearNotificationsByType = useCallback((errorType: string) => {
    setNotifications(prev => 
      prev.map(n => 
        n.error.type === errorType ? { ...n, dismissed: true } : n
      )
    );
  }, []);

  const clearNotificationsBySeverity = useCallback((severity: ErrorSeverity) => {
    setNotifications(prev => 
      prev.map(n => 
        n.error.severity === severity ? { ...n, dismissed: true } : n
      )
    );
  }, []);

  const updateNotificationActions = useCallback((id: string, actions: ErrorAction[]) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, actions } : n)
    );
  }, []);

  const getNotificationById = useCallback((id: string): ErrorNotification | undefined => {
    return notifications.find(n => n.id === id);
  }, [notifications]);

  const getNotificationsByType = useCallback((errorType: string): ErrorNotification[] => {
    return notifications.filter(n => n.error.type === errorType && !n.dismissed);
  }, [notifications]);

  const getNotificationsBySeverity = useCallback((severity: ErrorSeverity): ErrorNotification[] => {
    return notifications.filter(n => n.error.severity === severity && !n.dismissed);
  }, [notifications]);

  const hasActiveNotifications = useCallback((): boolean => {
    return notifications.some(n => !n.dismissed);
  }, [notifications]);

  const getActiveNotificationsCount = useCallback((): number => {
    return notifications.filter(n => !n.dismissed).length;
  }, [notifications]);

  // Convenience methods for different error types
  const showNetworkError = useCallback((message: string, config?: Partial<ErrorNotificationConfig>) => {
    const error: ApiError = {
      type: 'NETWORK',
      severity: ErrorSeverity.MEDIUM,
      errorId: `network-${Date.now()}`,
      timestamp: new Date().toISOString(),
      message: 'Network connection error',
      userMessage: message || 'Please check your internet connection and try again.',
      retryable: true
    };
    return addErrorNotification(error, config);
  }, [addErrorNotification]);

  const showAuthError = useCallback((message: string, config?: Partial<ErrorNotificationConfig>) => {
    const error: ApiError = {
      type: 'AUTHENTICATION',
      severity: ErrorSeverity.HIGH,
      errorId: `auth-${Date.now()}`,
      timestamp: new Date().toISOString(),
      message: 'Authentication error',
      userMessage: message || 'Your session has expired. Please sign in again.',
      retryable: false
    };
    return addErrorNotification(error, config);
  }, [addErrorNotification]);

  const showValidationError = useCallback((message: string, config?: Partial<ErrorNotificationConfig>) => {
    const error: ApiError = {
      type: 'VALIDATION',
      severity: ErrorSeverity.LOW,
      errorId: `validation-${Date.now()}`,
      timestamp: new Date().toISOString(),
      message: 'Validation error',
      userMessage: message || 'Please check your input and try again.',
      retryable: false
    };
    return addErrorNotification(error, config);
  }, [addErrorNotification]);

  const showServerError = useCallback((message: string, config?: Partial<ErrorNotificationConfig>) => {
    const error: ApiError = {
      type: 'SERVER',
      severity: ErrorSeverity.HIGH,
      errorId: `server-${Date.now()}`,
      timestamp: new Date().toISOString(),
      message: 'Server error',
      userMessage: message || 'We\'re experiencing technical difficulties. Please try again in a few moments.',
      retryable: true
    };
    return addErrorNotification(error, config);
  }, [addErrorNotification]);

  return {
    notifications: notifications.filter(n => !n.dismissed),
    addErrorNotification,
    removeNotification,
    clearAllNotifications,
    clearNotificationsByType,
    clearNotificationsBySeverity,
    updateNotificationActions,
    getNotificationById,
    getNotificationsByType,
    getNotificationsBySeverity,
    hasActiveNotifications,
    getActiveNotificationsCount,
    
    // Convenience methods
    showNetworkError,
    showAuthError,
    showValidationError,
    showServerError
  };
};