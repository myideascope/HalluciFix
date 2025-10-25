import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../useToast';
import { ApiError } from '../../lib/errors/types';

describe('useToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Date.now for consistent IDs
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty toasts array', () => {
      const { result } = renderHook(() => useToast());

      expect(result.current.toasts).toEqual([]);
    });

    it('should provide all toast methods', () => {
      const { result } = renderHook(() => useToast());

      expect(typeof result.current.addToast).toBe('function');
      expect(typeof result.current.removeToast).toBe('function');
      expect(typeof result.current.showSuccess).toBe('function');
      expect(typeof result.current.showWarning).toBe('function');
      expect(typeof result.current.showError).toBe('function');
      expect(typeof result.current.showInfo).toBe('function');
      expect(typeof result.current.showApiError).toBe('function');
    });
  });

  describe('addToast', () => {
    it('should add a toast with generated ID', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast({
          type: 'info',
          title: 'Test Toast',
          message: 'Test message'
        });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toEqual({
        id: expect.any(String),
        type: 'info',
        title: 'Test Toast',
        message: 'Test message'
      });
    });

    it('should return the generated toast ID', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;
      act(() => {
        toastId = result.current.addToast({
          type: 'info',
          title: 'Test Toast',
          message: 'Test message'
        });
      });

      expect(toastId!).toBe(result.current.toasts[0].id);
    });

    it('should add multiple toasts', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast({
          type: 'info',
          title: 'Toast 1',
          message: 'Message 1'
        });
        result.current.addToast({
          type: 'success',
          title: 'Toast 2',
          message: 'Message 2'
        });
      });

      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts[0].title).toBe('Toast 1');
      expect(result.current.toasts[1].title).toBe('Toast 2');
    });

    it('should generate unique IDs for each toast', () => {
      const { result } = renderHook(() => useToast());

      let id1: string, id2: string;
      act(() => {
        id1 = result.current.addToast({
          type: 'info',
          title: 'Toast 1',
          message: 'Message 1'
        });
        id2 = result.current.addToast({
          type: 'info',
          title: 'Toast 2',
          message: 'Message 2'
        });
      });

      expect(id1).not.toBe(id2);
    });
  });

  describe('removeToast', () => {
    it('should remove toast by ID', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;
      act(() => {
        toastId = result.current.addToast({
          type: 'info',
          title: 'Test Toast',
          message: 'Test message'
        });
      });

      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        result.current.removeToast(toastId);
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('should only remove the specified toast', () => {
      const { result } = renderHook(() => useToast());

      let id1: string, id2: string;
      act(() => {
        id1 = result.current.addToast({
          type: 'info',
          title: 'Toast 1',
          message: 'Message 1'
        });
        id2 = result.current.addToast({
          type: 'info',
          title: 'Toast 2',
          message: 'Message 2'
        });
      });

      act(() => {
        result.current.removeToast(id1);
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].id).toBe(id2);
    });

    it('should handle removing non-existent toast gracefully', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast({
          type: 'info',
          title: 'Test Toast',
          message: 'Test message'
        });
      });

      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        result.current.removeToast('non-existent-id');
      });

      expect(result.current.toasts).toHaveLength(1);
    });
  });

  describe('showSuccess', () => {
    it('should create success toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showSuccess('Success!', 'Operation completed successfully');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toEqual({
        id: expect.any(String),
        type: 'success',
        title: 'Success!',
        message: 'Operation completed successfully'
      });
    });

    it('should accept custom duration', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showSuccess('Success!', 'Message', 10000);
      });

      expect(result.current.toasts[0].duration).toBe(10000);
    });

    it('should return toast ID', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;
      act(() => {
        toastId = result.current.showSuccess('Success!', 'Message');
      });

      expect(toastId!).toBe(result.current.toasts[0].id);
    });
  });

  describe('showWarning', () => {
    it('should create warning toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showWarning('Warning!', 'Please check your input');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toEqual({
        id: expect.any(String),
        type: 'warning',
        title: 'Warning!',
        message: 'Please check your input'
      });
    });
  });

  describe('showError', () => {
    it('should create error toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showError('Error!', 'Something went wrong');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toEqual({
        id: expect.any(String),
        type: 'error',
        title: 'Error!',
        message: 'Something went wrong'
      });
    });

    it('should include error object when provided', () => {
      const { result } = renderHook(() => useToast());

      const mockError: ApiError = {
        type: 'api_error',
        severity: 'high',
        userMessage: 'API Error',
        technicalMessage: 'Internal server error',
        code: 'API_500',
        timestamp: new Date(),
        context: {}
      };

      act(() => {
        result.current.showError('Error!', 'API failed', 5000, mockError);
      });

      expect(result.current.toasts[0].error).toBe(mockError);
      expect(result.current.toasts[0].duration).toBe(5000);
    });
  });

  describe('showInfo', () => {
    it('should create info toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showInfo('Info', 'Here is some information');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toEqual({
        id: expect.any(String),
        type: 'info',
        title: 'Info',
        message: 'Here is some information'
      });
    });
  });

  describe('showApiError', () => {
    it('should create error toast from ApiError object', () => {
      const { result } = renderHook(() => useToast());

      const mockError: ApiError = {
        type: 'api_error',
        severity: 'medium',
        userMessage: 'Failed to save data',
        technicalMessage: 'Database connection timeout',
        code: 'DB_TIMEOUT',
        timestamp: new Date(),
        context: { userId: '123' }
      };

      act(() => {
        result.current.showApiError(mockError);
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toEqual({
        id: expect.any(String),
        type: 'error',
        title: 'Medium Error',
        message: 'Failed to save data',
        duration: 8000,
        error: mockError
      });
    });

    it('should handle critical errors with no auto-hide', () => {
      const { result } = renderHook(() => useToast());

      const criticalError: ApiError = {
        type: 'api_error',
        severity: 'critical',
        userMessage: 'System failure',
        technicalMessage: 'Critical system error',
        code: 'SYS_CRITICAL',
        timestamp: new Date(),
        context: {}
      };

      act(() => {
        result.current.showApiError(criticalError);
      });

      expect(result.current.toasts[0].duration).toBeUndefined();
      expect(result.current.toasts[0].title).toBe('Critical Error');
    });

    it('should include action buttons when provided', () => {
      const { result } = renderHook(() => useToast());

      const mockError: ApiError = {
        type: 'api_error',
        severity: 'high',
        userMessage: 'Network error',
        technicalMessage: 'Connection failed',
        code: 'NET_ERROR',
        timestamp: new Date(),
        context: {}
      };

      const actions = [
        { label: 'Retry', onClick: vi.fn(), primary: true },
        { label: 'Cancel', onClick: vi.fn() }
      ];

      act(() => {
        result.current.showApiError(mockError, actions);
      });

      expect(result.current.toasts[0].actions).toBe(actions);
    });

    it('should capitalize severity in title', () => {
      const { result } = renderHook(() => useToast());

      const mockError: ApiError = {
        type: 'api_error',
        severity: 'low',
        userMessage: 'Minor issue',
        technicalMessage: 'Non-critical error',
        code: 'MINOR',
        timestamp: new Date(),
        context: {}
      };

      act(() => {
        result.current.showApiError(mockError);
      });

      expect(result.current.toasts[0].title).toBe('Low Error');
    });
  });

  describe('function stability', () => {
    it('should maintain stable function references', () => {
      const { result, rerender } = renderHook(() => useToast());

      const initialFunctions = {
        addToast: result.current.addToast,
        removeToast: result.current.removeToast,
        showSuccess: result.current.showSuccess,
        showWarning: result.current.showWarning,
        showError: result.current.showError,
        showInfo: result.current.showInfo,
        showApiError: result.current.showApiError
      };

      rerender();

      expect(result.current.addToast).toBe(initialFunctions.addToast);
      expect(result.current.removeToast).toBe(initialFunctions.removeToast);
      expect(result.current.showSuccess).toBe(initialFunctions.showSuccess);
      expect(result.current.showWarning).toBe(initialFunctions.showWarning);
      expect(result.current.showError).toBe(initialFunctions.showError);
      expect(result.current.showInfo).toBe(initialFunctions.showInfo);
      expect(result.current.showApiError).toBe(initialFunctions.showApiError);
    });
  });

  describe('edge cases', () => {
    it('should handle empty title and message', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showInfo('', '');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('');
      expect(result.current.toasts[0].message).toBe('');
    });

    it('should handle very long messages', () => {
      const { result } = renderHook(() => useToast());

      const longMessage = 'A'.repeat(1000);

      act(() => {
        result.current.showInfo('Long Message', longMessage);
      });

      expect(result.current.toasts[0].message).toBe(longMessage);
    });

    it('should handle special characters in messages', () => {
      const { result } = renderHook(() => useToast());

      const specialMessage = '🎉 Success! <script>alert("xss")</script> & more';

      act(() => {
        result.current.showSuccess('Special', specialMessage);
      });

      expect(result.current.toasts[0].message).toBe(specialMessage);
    });

    it('should handle undefined duration gracefully', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showSuccess('Success', 'Message', undefined);
      });

      expect(result.current.toasts[0].duration).toBeUndefined();
    });
  });

  describe('performance', () => {
    it('should handle many toasts efficiently', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.addToast({
            type: 'info',
            title: `Toast ${i}`,
            message: `Message ${i}`
          });
        }
      });

      expect(result.current.toasts).toHaveLength(100);
    });

    it('should handle rapid add/remove operations', () => {
      const { result } = renderHook(() => useToast());

      const ids: string[] = [];

      act(() => {
        // Add many toasts
        for (let i = 0; i < 10; i++) {
          const id = result.current.addToast({
            type: 'info',
            title: `Toast ${i}`,
            message: `Message ${i}`
          });
          ids.push(id);
        }

        // Remove half of them
        for (let i = 0; i < 5; i++) {
          result.current.removeToast(ids[i]);
        }
      });

      expect(result.current.toasts).toHaveLength(5);
    });
  });
});