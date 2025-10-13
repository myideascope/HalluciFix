import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../useToast';
<<<<<<< HEAD

// Mock Date.now and Math.random for consistent IDs
const mockDateNow = vi.fn();
const mockMathRandom = vi.fn();
=======
import { ToastMessage } from '../../components/Toast';
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

describe('useToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
<<<<<<< HEAD
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
=======
    // Mock Date.now and Math.random for consistent IDs
    vi.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01 00:00:00
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
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

<<<<<<< HEAD
      act(() => {
        result.current.addToast({
          type: 'success',
          title: 'Success',
          message: 'Operation completed successfully'
        });
=======
      const toastData = {
        type: 'success' as const,
        title: 'Success',
        message: 'Operation completed successfully'
      };

      let toastId: string;
      act(() => {
        toastId = result.current.addToast(toastData);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toMatchObject({
<<<<<<< HEAD
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

=======
        ...toastData,
        id: expect.any(String)
      });
      expect(toastId!).toBe(result.current.toasts[0].id);
    });

    it('should add multiple toasts', () => {
      const { result } = renderHook(() => useToast());

>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
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
<<<<<<< HEAD
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
=======
      expect(result.current.toasts[0].title).toBe('First Toast');
      expect(result.current.toasts[1].title).toBe('Second Toast');
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
      });

      // Change the mock return values for the second toast
      vi.spyOn(Date, 'now').mockReturnValue(1640995201000);
      vi.spyOn(Math, 'random').mockReturnValue(0.987654321);

      act(() => {
        id2 = result.current.addToast({
          type: 'info',
          title: 'Toast 2',
          message: 'Message 2'
        });
      });

      expect(id1).not.toBe(id2);
      expect(result.current.toasts[0].id).toBe(id1);
      expect(result.current.toasts[1].id).toBe(id2);
    });

    it('should preserve toast properties including duration', () => {
      const { result } = renderHook(() => useToast());

      const toastData = {
        type: 'warning' as const,
        title: 'Warning',
        message: 'This is a warning',
        duration: 10000
      };

      act(() => {
        result.current.addToast(toastData);
      });

      expect(result.current.toasts[0]).toMatchObject(toastData);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('removeToast', () => {
    it('should remove toast by ID', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;
      act(() => {
        toastId = result.current.addToast({
          type: 'success',
<<<<<<< HEAD
          title: 'Success',
          message: 'Success message'
=======
          title: 'Test Toast',
          message: 'Test message'
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        });
      });

      expect(result.current.toasts).toHaveLength(1);

      act(() => {
<<<<<<< HEAD
        result.current.removeToast(toastId!);
=======
        result.current.removeToast(toastId);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('should remove only the specified toast', () => {
      const { result } = renderHook(() => useToast());

<<<<<<< HEAD
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
=======
      let id1: string, id2: string, id3: string;

      act(() => {
        id1 = result.current.addToast({
          type: 'success',
          title: 'Toast 1',
          message: 'Message 1'
        });
      });

      vi.spyOn(Date, 'now').mockReturnValue(1640995201000);
      act(() => {
        id2 = result.current.addToast({
          type: 'error',
          title: 'Toast 2',
          message: 'Message 2'
        });
      });

      vi.spyOn(Date, 'now').mockReturnValue(1640995202000);
      act(() => {
        id3 = result.current.addToast({
          type: 'info',
          title: 'Toast 3',
          message: 'Message 3'
        });
      });

      expect(result.current.toasts).toHaveLength(3);

      act(() => {
        result.current.removeToast(id2);
      });

      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts.find(t => t.id === id1)).toBeDefined();
      expect(result.current.toasts.find(t => t.id === id2)).toBeUndefined();
      expect(result.current.toasts.find(t => t.id === id3)).toBeDefined();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });

    it('should handle removing non-existent toast gracefully', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast({
          type: 'success',
<<<<<<< HEAD
          title: 'Success',
          message: 'Success message'
=======
          title: 'Test Toast',
          message: 'Test message'
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        });
      });

      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        result.current.removeToast('non-existent-id');
      });

      expect(result.current.toasts).toHaveLength(1);
    });
<<<<<<< HEAD

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
=======
  });

  describe('convenience methods', () => {
    describe('showSuccess', () => {
      it('should create success toast with correct properties', () => {
        const { result } = renderHook(() => useToast());

        let toastId: string;
        act(() => {
          toastId = result.current.showSuccess('Success Title', 'Success message');
        });

        expect(result.current.toasts).toHaveLength(1);
        expect(result.current.toasts[0]).toMatchObject({
          type: 'success',
          title: 'Success Title',
          message: 'Success message',
          id: toastId!
        });
      });

      it('should accept custom duration', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
          result.current.showSuccess('Success', 'Message', 8000);
        });

        expect(result.current.toasts[0].duration).toBe(8000);
      });

      it('should return toast ID', () => {
        const { result } = renderHook(() => useToast());

        let returnedId: string;
        act(() => {
          returnedId = result.current.showSuccess('Success', 'Message');
        });

        expect(returnedId!).toBe(result.current.toasts[0].id);
      });
    });

    describe('showWarning', () => {
      it('should create warning toast with correct properties', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
          result.current.showWarning('Warning Title', 'Warning message');
        });

        expect(result.current.toasts[0]).toMatchObject({
          type: 'warning',
          title: 'Warning Title',
          message: 'Warning message'
        });
      });

      it('should accept custom duration', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
          result.current.showWarning('Warning', 'Message', 12000);
        });

        expect(result.current.toasts[0].duration).toBe(12000);
      });
    });

    describe('showError', () => {
      it('should create error toast with correct properties', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
          result.current.showError('Error Title', 'Error message');
        });

        expect(result.current.toasts[0]).toMatchObject({
          type: 'error',
          title: 'Error Title',
          message: 'Error message'
        });
      });

      it('should accept custom duration', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
          result.current.showError('Error', 'Message', 15000);
        });

        expect(result.current.toasts[0].duration).toBe(15000);
      });
    });

    describe('showInfo', () => {
      it('should create info toast with correct properties', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
          result.current.showInfo('Info Title', 'Info message');
        });

        expect(result.current.toasts[0]).toMatchObject({
          type: 'info',
          title: 'Info Title',
          message: 'Info message'
        });
      });

      it('should accept custom duration', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
          result.current.showInfo('Info', 'Message', 6000);
        });

        expect(result.current.toasts[0].duration).toBe(6000);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      });
    });
  });

  describe('function stability', () => {
<<<<<<< HEAD
    it('should return stable function references', () => {
      const { result, rerender } = renderHook(() => useToast());

      const firstRender = {
=======
    it('should maintain stable function references', () => {
      const { result, rerender } = renderHook(() => useToast());

      const initialFunctions = {
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        addToast: result.current.addToast,
        removeToast: result.current.removeToast,
        showSuccess: result.current.showSuccess,
        showWarning: result.current.showWarning,
        showError: result.current.showError,
        showInfo: result.current.showInfo
      };

      rerender();

<<<<<<< HEAD
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
=======
      expect(result.current.addToast).toBe(initialFunctions.addToast);
      expect(result.current.removeToast).toBe(initialFunctions.removeToast);
      expect(result.current.showSuccess).toBe(initialFunctions.showSuccess);
      expect(result.current.showWarning).toBe(initialFunctions.showWarning);
      expect(result.current.showError).toBe(initialFunctions.showError);
      expect(result.current.showInfo).toBe(initialFunctions.showInfo);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('complex scenarios', () => {
<<<<<<< HEAD
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
=======
    it('should handle rapid toast additions and removals', () => {
      const { result } = renderHook(() => useToast());

      const ids: string[] = [];

      // Add multiple toasts rapidly
      act(() => {
        for (let i = 0; i < 5; i++) {
          vi.spyOn(Date, 'now').mockReturnValue(1640995200000 + i);
          ids.push(result.current.addToast({
            type: 'info',
            title: `Toast ${i}`,
            message: `Message ${i}`
          }));
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        }
      });

      expect(result.current.toasts).toHaveLength(5);

<<<<<<< HEAD
      // Remove every other toast
      act(() => {
        result.current.removeToast(toastIds[0]);
        result.current.removeToast(toastIds[2]);
        result.current.removeToast(toastIds[4]);
      });

      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts[0].title).toBe('Toast 1');
      expect(result.current.toasts[1].title).toBe('Toast 3');
=======
      // Remove some toasts
      act(() => {
        result.current.removeToast(ids[1]);
        result.current.removeToast(ids[3]);
      });

      expect(result.current.toasts).toHaveLength(3);
      expect(result.current.toasts.map(t => t.title)).toEqual(['Toast 0', 'Toast 2', 'Toast 4']);
    });

    it('should handle mixed toast types', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showSuccess('Success', 'Success message');
        result.current.showError('Error', 'Error message');
        result.current.showWarning('Warning', 'Warning message');
        result.current.showInfo('Info', 'Info message');
      });

      expect(result.current.toasts).toHaveLength(4);
      expect(result.current.toasts.map(t => t.type)).toEqual(['success', 'error', 'warning', 'info']);
    });

    it('should maintain toast order', () => {
      const { result } = renderHook(() => useToast());

      const titles = ['First', 'Second', 'Third'];

      act(() => {
        titles.forEach((title, index) => {
          vi.spyOn(Date, 'now').mockReturnValue(1640995200000 + index);
          result.current.addToast({
            type: 'info',
            title,
            message: `Message ${index}`
          });
        });
      });

      expect(result.current.toasts.map(t => t.title)).toEqual(titles);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('edge cases', () => {
    it('should handle empty title and message', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
<<<<<<< HEAD
        result.current.showSuccess('', '');
      });

      expect(result.current.toasts[0]).toMatchObject({
        type: 'success',
=======
        result.current.addToast({
          type: 'info',
          title: '',
          message: ''
        });
      });

      expect(result.current.toasts[0]).toMatchObject({
        type: 'info',
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        title: '',
        message: ''
      });
    });

    it('should handle very long title and message', () => {
      const { result } = renderHook(() => useToast());

      const longTitle = 'A'.repeat(1000);
      const longMessage = 'B'.repeat(5000);

      act(() => {
<<<<<<< HEAD
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
=======
        result.current.addToast({
          type: 'info',
          title: longTitle,
          message: longMessage
        });
      });

      expect(result.current.toasts[0].title).toBe(longTitle);
      expect(result.current.toasts[0].message).toBe(longMessage);
    });

    it('should handle special characters in title and message', () => {
      const { result } = renderHook(() => useToast());

      const specialTitle = '🎉 Success! <script>alert("xss")</script>';
      const specialMessage = 'Message with "quotes" and \'apostrophes\' & symbols';

      act(() => {
        result.current.addToast({
          type: 'success',
          title: specialTitle,
          message: specialMessage
        });
      });

      expect(result.current.toasts[0].title).toBe(specialTitle);
      expect(result.current.toasts[0].message).toBe(specialMessage);
    });

    it('should handle zero and negative durations', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showSuccess('Zero Duration', 'Message', 0);
      });

      act(() => {
        result.current.showError('Negative Duration', 'Message', -1000);
      });

      expect(result.current.toasts[0].duration).toBe(0);
      expect(result.current.toasts[1].duration).toBe(-1000);
    });
  });

  describe('memory management', () => {
    it('should not leak memory with many toast operations', () => {
      const { result } = renderHook(() => useToast());

      // Simulate many operations
      for (let i = 0; i < 100; i++) {
        act(() => {
          const id = result.current.addToast({
            type: 'info',
            title: `Toast ${i}`,
            message: `Message ${i}`
          });
          
          // Remove immediately to simulate cleanup
          result.current.removeToast(id);
        });
      }

      expect(result.current.toasts).toHaveLength(0);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });
});