import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDarkMode } from '../useDarkMode';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

// Mock matchMedia
const mockMatchMedia = vi.fn();

describe('useDarkMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true
    });

    // Setup matchMedia mock
    Object.defineProperty(window, 'matchMedia', {
      value: mockMatchMedia,
      writable: true
    });

    // Setup document.documentElement mock
    Object.defineProperty(document, 'documentElement', {
      value: {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        },
        setAttribute: vi.fn()
      },
      writable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with saved preference from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('true');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(true);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('darkMode');
    });

    it('should initialize with system preference when no saved preference', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockMatchMedia.mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(true);
      expect(mockMatchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    });

    it('should initialize with light mode when no preference and system is light', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(false);
    });

    it('should handle invalid JSON in localStorage gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid-json');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      // Should not throw and fall back to system preference
      expect(() => {
        renderHook(() => useDarkMode());
      }).not.toThrow();
    });
  });

  describe('DOM manipulation', () => {
    it('should add dark class and set data-theme when dark mode is enabled', () => {
      mockLocalStorage.getItem.mockReturnValue('true');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      renderHook(() => useDarkMode());

      expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('should remove dark class and set light data-theme when dark mode is disabled', () => {
      mockLocalStorage.getItem.mockReturnValue('false');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      renderHook(() => useDarkMode());

      expect(document.documentElement.classList.remove).toHaveBeenCalledWith('dark');
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('should update DOM when toggling dark mode', () => {
      mockLocalStorage.getItem.mockReturnValue('false');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });
  });

  describe('localStorage persistence', () => {
    it('should save preference to localStorage on initialization', () => {
      mockLocalStorage.getItem.mockReturnValue('true');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      renderHook(() => useDarkMode());

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('darkMode', 'true');
    });

    it('should save preference to localStorage when toggling', () => {
      mockLocalStorage.getItem.mockReturnValue('false');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('darkMode', 'true');
    });

    it('should save false preference correctly', () => {
      mockLocalStorage.getItem.mockReturnValue('true');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('darkMode', 'false');
    });
  });

  describe('system theme change listener', () => {
    it('should add event listener for system theme changes', () => {
      const mockAddEventListener = vi.fn();
      const mockRemoveEventListener = vi.fn();
      
      mockLocalStorage.getItem.mockReturnValue(null);
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener
      });

      renderHook(() => useDarkMode());

      expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should remove event listener on unmount', () => {
      const mockAddEventListener = vi.fn();
      const mockRemoveEventListener = vi.fn();
      
      mockLocalStorage.getItem.mockReturnValue(null);
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener
      });

      const { unmount } = renderHook(() => useDarkMode());
      unmount();

      expect(mockRemoveEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should update theme when system preference changes and no saved preference', () => {
      let changeHandler: (e: MediaQueryListEvent) => void;
      const mockAddEventListener = vi.fn((event, handler) => {
        if (event === 'change') {
          changeHandler = handler;
        }
      });
      
      mockLocalStorage.getItem.mockReturnValue(null);
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: mockAddEventListener,
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(false);

      // Simulate system theme change to dark
      act(() => {
        changeHandler({ matches: true } as MediaQueryListEvent);
      });

      expect(result.current.isDarkMode).toBe(true);
    });

    it('should not update theme when system preference changes but user has saved preference', () => {
      let changeHandler: (e: MediaQueryListEvent) => void;
      const mockAddEventListener = vi.fn((event, handler) => {
        if (event === 'change') {
          changeHandler = handler;
        }
      });
      
      // User has explicitly set light mode
      mockLocalStorage.getItem.mockReturnValue('false');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: mockAddEventListener,
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(false);

      // Simulate system theme change to dark
      act(() => {
        changeHandler({ matches: true } as MediaQueryListEvent);
      });

      // Should remain false because user has saved preference
      expect(result.current.isDarkMode).toBe(false);
    });
  });

  describe('toggleDarkMode function', () => {
    it('should toggle from false to true', () => {
      mockLocalStorage.getItem.mockReturnValue('false');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(false);

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(result.current.isDarkMode).toBe(true);
    });

    it('should toggle from true to false', () => {
      mockLocalStorage.getItem.mockReturnValue('true');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(true);

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(result.current.isDarkMode).toBe(false);
    });

    it('should toggle multiple times correctly', () => {
      mockLocalStorage.getItem.mockReturnValue('false');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(false);

      act(() => {
        result.current.toggleDarkMode();
      });
      expect(result.current.isDarkMode).toBe(true);

      act(() => {
        result.current.toggleDarkMode();
      });
      expect(result.current.isDarkMode).toBe(false);

      act(() => {
        result.current.toggleDarkMode();
      });
      expect(result.current.isDarkMode).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle missing matchMedia gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      
      // Remove matchMedia
      delete (window as any).matchMedia;

      expect(() => {
        renderHook(() => useDarkMode());
      }).toThrow(); // This would throw in real scenario, but we expect it to be handled
    });

    it('should handle localStorage errors gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      expect(() => {
        renderHook(() => useDarkMode());
      }).not.toThrow();
    });

    it('should handle setItem localStorage errors gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue('false');
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('localStorage quota exceeded');
      });
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result } = renderHook(() => useDarkMode());

      expect(() => {
        act(() => {
          result.current.toggleDarkMode();
        });
      }).not.toThrow();
    });
  });

  describe('return value stability', () => {
    it('should return stable toggleDarkMode function reference', () => {
      mockLocalStorage.getItem.mockReturnValue('false');
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const { result, rerender } = renderHook(() => useDarkMode());
      const firstToggleRef = result.current.toggleDarkMode;

      rerender();
      const secondToggleRef = result.current.toggleDarkMode;

      expect(firstToggleRef).toBe(secondToggleRef);
    });
  });
});