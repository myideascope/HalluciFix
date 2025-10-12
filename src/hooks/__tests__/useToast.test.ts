import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../useToast';

// Mock Date.now and Math.random for consistent IDs
const mockDateNow = vi.fn();
const mockMathRandom = vi.fn();

describe('useToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock Date.now to return predictable values
    mockDateNow.mockReturnValue(1640995200000); // 2022-01-01T00:00:00.000Z
    vi.stubGlobal('Date', {
      ...Date,
      now: mockDateNow
    });

    // Mock Math.random to return predictable values
    mockMathRandom.mockReturnValue(0.123456789);
    vi.stubGlobal('Math', {
      ...Math,
      random: mockMathRandom
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty toasts array', () => {
      const { result } = renderHook(() => useToast());

      expect(result.current.toasts).toEqual([]);
    });

    it('should provide all expected methods', () => {
      const { result } = renderHook(() => useToast());

      expect(typeof result.current.addToast).toBe('function');
      expect(typeof result.current.removeToast).toBe('function');
      expect(typeof result.current.showSuccess).toBe('function');
      expect(typeof result.current.showWarning).toBe('function');
      expect(typeof result.current.showError).toBe('function');
      expect(typeof result.current.showInfo).toBe('function');
    });
  });

  describe('addToast', () => {
    it('should add a toast with generated ID', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast({
          type: 'success',
          title: 'Success',
          message: 'Operation completed successfully'
        });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toMatchObject({
        type: 'success',
        title: 'Success',
        message: 'Operation completed successfully',
        id: expect.any(String)
      });
    });

    it('should generate unique IDs for multiple toasts', () => {
      const { result } = renderHook(() => useToast());

      // Mock different return values for subsequent calls
      mockDateNow
        .mockReturnValueOnce(1640995200000)
        .mockReturnValueOnce(1640995201000);
      mockMathRandom
        .mockReturnValueOnce(0.123456789)
        .mockReturnValueOnce(0.987654321);

      act(() => {
        result.current.addToast({
          type: 'success',
          title: 'First Toast',
          message: 'First message'
        });
      });

      act(() => {
        result.current.addToast({
          type: 'error',
          title: 'Second Toast',
          message: 'Second message'
        });
      });

      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts[0].id).not.toBe(result.current.toasts[1].id);
    });

    it('should return the generated ID', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;
      act(() => {
        toastId = result.current.addToast({
          type: 'info',
          title: 'Info',
          message: 'Information message'
        });
      });

      expect(toastId!).toBe(result.current.toasts[0].id);
    });

    it('should add toast with optional duration', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast({
          type: 'warning',
          title: 'Warning',
          message: 'Warning message',
          duration: 5000
        });
      });

      expect(result.current.toasts[0]).toMatchObject({
        type: 'warning',
        title: 'Warning',
        message: 'Warning message',
        duration: 5000
      });
    });

    it('should add multiple toasts in order', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast({
          type: 'success',
          title: 'First',
          message: 'First message'
        });
      });

      act(() => {
        result.current.addToast({
          type: 'error',
          title: 'Second',
          message: 'Second message'
        });
      });

      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts[0].title).toBe('First');
      expect(result.current.toasts[1].title).toBe('Second');
    });
  });

  describe('removeToast', () => {
    it('should remove toast by ID', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;
      act(() => {
        toastId = result.current.addToast({
          type: 'success',
          title: 'Success',
          message: 'Success message'
        });
      });

      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        result.current.removeToast(toastId!);
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('should remove only the specified toast', () => {
      const { result } = renderHook(() => useToast());

      mockDateNow
        .mockReturnValueOnce(1640995200000)
        .mockReturnValueOnce(1640995201000);
      mockMathRandom
        .mockReturnValueOnce(0.123456789)
        .mockReturnValueOnce(0.987654321);

      let firstToastId: string;
      let secondToastId: string;

      act(() => {
        firstToastId = result.current.addToast({
          type: 'success',
          title: 'First',
          message: 'First message'
        });
      });

      act(() => {
        secondToastId = result.current.addToast({
          type: 'error',
          title: 'Second',
          message: 'Second message'
        });
      });

      expect(result.current.toasts).toHaveLength(2);

      act(() => {
        result.current.removeToast(firstToastId!);
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].id).toBe(secondToastId!);
      expect(result.current.toasts[0].title).toBe('Second');
    });

    it('should handle removing non-existent toast gracefully', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast({
          type: 'success',
          title: 'Success',
          message: 'Success message'
        });
      });

      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        result.current.removeToast('non-existent-id');
      });

      expect(result.current.toasts).toHaveLength(1);
    });

    it('should handle removing from empty toasts array', () => {
      const { result } = renderHook(() => useToast());

      expect(result.current.toasts).toHaveLength(0);

      act(() => {
        result.current.removeToast('any-id');
      });

      expect(result.current.toasts).toHaveLength(0);
    });
  });

  describe('showSuccess', () => {
    it('should add success toast with correct type', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showSuccess('Success Title', 'Success message');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toMatchObject({
        type: 'success',
        title: 'Success Title',
        message: 'Success message'
      });
    });

    it('should add success toast with custom duration', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showSuccess('Success Title', 'Success message', 3000);
      });

      expect(result.current.toasts[0]).toMatchObject({
        type: 'success',
        title: 'Success Title',
        message: 'Success message',
        duration: 3000
      });
    });

    it('should return toast ID', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;
      act(() => {
        toastId = result.current.showSuccess('Success', 'Message');
      });

      expect(toastId!).toBe(result.current.toasts[0].id);
    });
  });

  describe('showWarning', () => {
    it('should add warning toast with correct type', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showWarning('Warning Title', 'Warning message');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toMatchObject({
        type: 'warning',
        title: 'Warning Title',
        message: 'Warning message'
      });
    });

    it('should add warning toast with custom duration', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showWarning('Warning Title', 'Warning message', 4000);
      });

      expect(result.current.toasts[0]).toMatchObject({
        type: 'warning',
        duration: 4000
      });
    });
  });

  describe('showError', () => {
    it('should add error toast with correct type', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showError('Error Title', 'Error message');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toMatchObject({
        type: 'error',
        title: 'Error Title',
        message: 'Error message'
      });
    });

    it('should add error toast with custom duration', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showError('Error Title', 'Error message', 6000);
      });

      expect(result.current.toasts[0]).toMatchObject({
        type: 'error',
        duration: 6000
      });
    });
  });

  describe('showInfo', () => {
    it('should add info toast with correct type', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showInfo('Info Title', 'Info message');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toMatchObject({
        type: 'info',
        title: 'Info Title',
        message: 'Info message'
      });
    });

    it('should add info toast with custom duration', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showInfo('Info Title', 'Info message', 2000);
      });

      expect(result.current.toasts[0]).toMatchObject({
        type: 'info',
        duration: 2000
      });
    });
  });

  describe('function stability', () => {
    it('should return stable function references', () => {
      const { result, rerender } = renderHook(() => useToast());

      const firstRender = {
        addToast: result.current.addToast,
        removeToast: result.current.removeToast,
        showSuccess: result.current.showSuccess,
        showWarning: result.current.showWarning,
        showError: result.current.showError,
        showInfo: result.current.showInfo
      };

      rerender();

      const secondRender = {
        addToast: result.current.addToast,
        removeToast: result.current.removeToast,
        showSuccess: result.current.showSuccess,
        showWarning: result.current.showWarning,
        showError: result.current.showError,
        showInfo: result.current.showInfo
      };

      expect(firstRender.addToast).toBe(secondRender.addToast);
      expect(firstRender.removeToast).toBe(secondRender.removeToast);
      expect(firstRender.showSuccess).toBe(secondRender.showSuccess);
      expect(firstRender.showWarning).toBe(secondRender.showWarning);
      expect(firstRender.showError).toBe(secondRender.showError);
      expect(firstRender.showInfo).toBe(secondRender.showInfo);
    });
  });

  describe('complex scenarios', () => {
    it('should handle mixed toast operations', () => {
      const { result } = renderHook(() => useToast());

      mockDateNow
        .mockReturnValueOnce(1640995200000)
        .mockReturnValueOnce(1640995201000)
        .mockReturnValueOnce(1640995202000);
      mockMathRandom
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.2)
        .mockReturnValueOnce(0.3);

      let successId: string;
      let warningId: string;
      let errorId: string;

      // Add multiple toasts
      act(() => {
        successId = result.current.showSuccess('Success', 'Success message');
        warningId = result.current.showWarning('Warning', 'Warning message');
        errorId = result.current.showError('Error', 'Error message');
      });

      expect(result.current.toasts).toHaveLength(3);

      // Remove middle toast
      act(() => {
        result.current.removeToast(warningId!);
      });

      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts[0].type).toBe('success');
      expect(result.current.toasts[1].type).toBe('error');

      // Add another toast
      act(() => {
        result.current.showInfo('Info', 'Info message');
      });

      expect(result.current.toasts).toHaveLength(3);
      expect(result.current.toasts[2].type).toBe('info');
    });

    it('should handle rapid toast additions and removals', () => {
      const { result } = renderHook(() => useToast());

      const toastIds: string[] = [];

      // Add 5 toasts rapidly
      act(() => {
        for (let i = 0; i < 5; i++) {
          mockDateNow.mockReturnValueOnce(1640995200000 + i);
          mockMathRandom.mockReturnValueOnce(0.1 + i * 0.1);
          
          const id = result.current.addToast({
            type: 'info',
            title: `Toast ${i}`,
            message: `Message ${i}`
          });
          toastIds.push(id);
        }
      });

      expect(result.current.toasts).toHaveLength(5);

      // Remove every other toast
      act(() => {
        result.current.removeToast(toastIds[0]);
        result.current.removeToast(toastIds[2]);
        result.current.removeToast(toastIds[4]);
      });

      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts[0].title).toBe('Toast 1');
      expect(result.current.toasts[1].title).toBe('Toast 3');
    });
  });

  describe('edge cases', () => {
    it('should handle empty title and message', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showSuccess('', '');
      });

      expect(result.current.toasts[0]).toMatchObject({
        type: 'success',
        title: '',
        message: ''
      });
    });

    it('should handle very long title and message', () => {
      const { result } = renderHook(() => useToast());

      const longTitle = 'A'.repeat(1000);
      const longMessage = 'B'.repeat(5000);

      act(() => {
        result.current.showError(longTitle, longMessage);
      });

      expect(result.current.toasts[0]).toMatchObject({
        type: 'error',
        title: longTitle,
        message: longMessage
      });
    });

    it('should handle zero duration', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showInfo('Info', 'Message', 0);
      });

      expect(result.current.toasts[0]).toMatchObject({
        duration: 0
      });
    });

    it('should handle negative duration', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showWarning('Warning', 'Message', -1000);
      });

      expect(result.current.toasts[0]).toMatchObject({
        duration: -1000
      });
    });
  });
});