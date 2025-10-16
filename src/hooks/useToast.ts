import { useState, useCallback } from 'react';
import { ToastMessage } from '../components/Toast';
import { ApiError } from '../lib/errors/types';

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newToast: ToastMessage = { ...toast, id };
    
    setToasts(prev => [...prev, newToast]);
    
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showSuccess = useCallback((title: string, message: string, duration?: number) => {
    return addToast({ type: 'success', title, message, duration });
  }, [addToast]);

  const showWarning = useCallback((title: string, message: string, duration?: number) => {
    return addToast({ type: 'warning', title, message, duration });
  }, [addToast]);

  const showError = useCallback((title: string, message: string, duration?: number, error?: ApiError) => {
    return addToast({ type: 'error', title, message, duration, error });
  }, [addToast]);

  const showInfo = useCallback((title: string, message: string, duration?: number) => {
    return addToast({ type: 'info', title, message, duration });
  }, [addToast]);

  const showApiError = useCallback((error: ApiError, actions?: Array<{ label: string; onClick: () => void; primary?: boolean }>) => {
    return addToast({
      type: 'error',
      title: `${error.severity.charAt(0).toUpperCase() + error.severity.slice(1)} Error`,
      message: error.userMessage,
      duration: error.severity === 'critical' ? undefined : 8000, // Critical errors don't auto-hide
      error,
      actions
    });
  }, [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    showSuccess,
    showWarning,
    showError,
    showInfo,
    showApiError
  };
};