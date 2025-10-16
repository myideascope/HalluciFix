/**
 * Error Notification Service
 * Provides centralized error notification management with severity-based handling
 */

import { ApiError, ErrorSeverity, ErrorAction, ErrorActionType } from './types';

export interface NotificationConfig {
  autoHide: boolean;
  duration?: number;
  persistent: boolean;
  showActions: boolean;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center';
}

export interface ErrorNotificationService {
  showError(error: ApiError, config?: Partial<NotificationConfig>): string;
  hideError(notificationId: string): void;
  clearAllErrors(): void;
  updateErrorActions(notificationId: string, actions: ErrorAction[]): void;
}

class ErrorNotificationServiceImpl implements ErrorNotificationService {
  private notifications = new Map<string, {
    error: ApiError;
    config: NotificationConfig;
    timestamp: number;
  }>();

  private listeners = new Set<(notifications: Map<string, any>) => void>();

  private defaultConfig: NotificationConfig = {
    autoHide: true,
    duration: 5000,
    persistent: false,
    showActions: true,
    position: 'top-right'
  };

  constructor() {
    // Auto-cleanup old notifications
    setInterval(() => {
      this.cleanupExpiredNotifications();
    }, 30000); // Every 30 seconds
  }

  showError(error: ApiError, config: Partial<NotificationConfig> = {}): string {
    const notificationId = this.generateNotificationId();
    const finalConfig = this.getConfigForError(error, config);

    this.notifications.set(notificationId, {
      error,
      config: finalConfig,
      timestamp: Date.now()
    });

    this.notifyListeners();

    // Auto-hide if configured
    if (finalConfig.autoHide && finalConfig.duration) {
      setTimeout(() => {
        this.hideError(notificationId);
      }, finalConfig.duration);
    }

    return notificationId;
  }

  hideError(notificationId: string): void {
    if (this.notifications.has(notificationId)) {
      this.notifications.delete(notificationId);
      this.notifyListeners();
    }
  }

  clearAllErrors(): void {
    this.notifications.clear();
    this.notifyListeners();
  }

  updateErrorActions(notificationId: string, actions: ErrorAction[]): void {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      // Actions would be stored in the error object or config
      // This is a placeholder for the implementation
      this.notifyListeners();
    }
  }

  subscribe(listener: (notifications: Map<string, any>) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getActiveNotifications(): Array<{ id: string; error: ApiError; config: NotificationConfig }> {
    return Array.from(this.notifications.entries()).map(([id, data]) => ({
      id,
      error: data.error,
      config: data.config
    }));
  }

  private generateNotificationId(): string {
    return `error-notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getConfigForError(error: ApiError, userConfig: Partial<NotificationConfig>): NotificationConfig {
    const baseConfig = { ...this.defaultConfig };

    // Adjust config based on error severity
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        baseConfig.autoHide = false;
        baseConfig.persistent = true;
        baseConfig.duration = undefined;
        break;
      case ErrorSeverity.HIGH:
        baseConfig.duration = 10000; // 10 seconds
        break;
      case ErrorSeverity.MEDIUM:
        baseConfig.duration = 7000; // 7 seconds
        break;
      case ErrorSeverity.LOW:
        baseConfig.duration = 5000; // 5 seconds
        break;
    }

    return { ...baseConfig, ...userConfig };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      listener(this.notifications);
    });
  }

  private cleanupExpiredNotifications(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [id, notification] of this.notifications.entries()) {
      if (now - notification.timestamp > maxAge) {
        this.notifications.delete(id);
      }
    }

    if (this.notifications.size > 0) {
      this.notifyListeners();
    }
  }
}

// Singleton instance
export const errorNotificationService = new ErrorNotificationServiceImpl();

// React hook for using the notification service
export const useErrorNotificationService = () => {
  return {
    showError: errorNotificationService.showError.bind(errorNotificationService),
    hideError: errorNotificationService.hideError.bind(errorNotificationService),
    clearAllErrors: errorNotificationService.clearAllErrors.bind(errorNotificationService),
    updateErrorActions: errorNotificationService.updateErrorActions.bind(errorNotificationService),
    getActiveNotifications: errorNotificationService.getActiveNotifications.bind(errorNotificationService),
    subscribe: errorNotificationService.subscribe.bind(errorNotificationService)
  };
};

// Helper functions for common error scenarios
export const showNetworkError = (message?: string) => {
  const error: ApiError = {
    type: 'NETWORK',
    severity: ErrorSeverity.MEDIUM,
    errorId: `network-${Date.now()}`,
    timestamp: new Date().toISOString(),
    message: 'Network connection error',
    userMessage: message || 'Please check your internet connection and try again.',
    retryable: true
  };

  return errorNotificationService.showError(error);
};

export const showAuthenticationError = (message?: string) => {
  const error: ApiError = {
    type: 'AUTHENTICATION',
    severity: ErrorSeverity.HIGH,
    errorId: `auth-${Date.now()}`,
    timestamp: new Date().toISOString(),
    message: 'Authentication failed',
    userMessage: message || 'Your session has expired. Please sign in again.',
    retryable: false
  };

  return errorNotificationService.showError(error);
};

export const showValidationError = (message: string, details?: any) => {
  const error: ApiError = {
    type: 'VALIDATION',
    severity: ErrorSeverity.LOW,
    errorId: `validation-${Date.now()}`,
    timestamp: new Date().toISOString(),
    message: 'Validation error',
    userMessage: message,
    details,
    retryable: false
  };

  return errorNotificationService.showError(error);
};

export const showServerError = (message?: string) => {
  const error: ApiError = {
    type: 'SERVER',
    severity: ErrorSeverity.HIGH,
    errorId: `server-${Date.now()}`,
    timestamp: new Date().toISOString(),
    message: 'Server error',
    userMessage: message || 'We\'re experiencing technical difficulties. Please try again in a few moments.',
    retryable: true
  };

  return errorNotificationService.showError(error);
};

export const showCriticalError = (message: string, details?: any) => {
  const error: ApiError = {
    type: 'UNKNOWN',
    severity: ErrorSeverity.CRITICAL,
    errorId: `critical-${Date.now()}`,
    timestamp: new Date().toISOString(),
    message: 'Critical system error',
    userMessage: message,
    details,
    retryable: false
  };

  return errorNotificationService.showError(error, {
    persistent: true,
    autoHide: false
  });
};