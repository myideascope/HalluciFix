import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDarkMode } from '../useDarkMode';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock matchMedia
const matchMediaMock = vi.fn();
Object.defineProperty(window, 'matchMedia', { value: matchMediaMock });

describe('useDarkMode', () => {
  let mockMediaQuery: {
    matches: boolean;
    addEventListener: vi.Mock;
    removeEventListener: vi.Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockMediaQuery = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    
    matchMediaMock.mockReturnValue(mockMediaQuery);
    localStorageMock.getItem.mockReturnValue(null);
    
    // Mock document.documentElement
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
    vi.resetAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with saved preference from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('true');

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(true);
      expect(localStorageMock.getItem).toHaveBeenCalledWith('darkMode');
    });

    it('should initialize with system preference when no saved preference', () => {
      localStorageMock.getItem.mockReturnValue(null);
      mockMediaQuery.matches = true;

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(true);
      expect(matchMediaMock).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    });

    it('should default to light mode when no preference and system is light', () => {
      localStorageMock.getItem.mockReturnValue(null);
      mockMediaQuery.matches = false;

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(false);
    });

    it('should parse saved preference correctly', () => {
      localStorageMock.getItem.mockReturnValue('false');

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(false);
    });
  });

  describe('DOM manipulation', () => {
    it('should add dark class and attribute when dark mode is enabled', () => {
      localStorageMock.getItem.mockReturnValue('true');

      renderHook(() => useDarkMode());

      expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('should remove dark class and set light attribute when dark mode is disabled', () => {
      localStorageMock.getItem.mockReturnValue('false');

      renderHook(() => useDarkMode());

      expect(document.documentElement.classList.remove).toHaveBeenCalledWith('dark');
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('should update DOM when dark mode is toggled', () => {
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
      localStorageMock.getItem.mockReturnValue(null);
      mockMediaQuery.matches = true;

      renderHook(() => useDarkMode());

      expect(localStorageMock.setItem).toHaveBeenCalledWith('darkMode', 'true');
    });

    it('should save preference to localStorage when toggled', () => {
      const { result } = renderHook(() => useDarkMode());

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('darkMode', 'true');
    });

    it('should update localStorage when toggled multiple times', () => {
      const { result } = renderHook(() => useDarkMode());

      act(() => {
        result.current.toggleDarkMode(); // true
      });

      act(() => {
        result.current.toggleDarkMode(); // false
      });

      expect(localStorageMock.setItem).toHaveBeenLastCalledWith('darkMode', 'false');
    });
  });

  describe('toggle functionality', () => {
    it('should toggle from light to dark mode', () => {
      localStorageMock.getItem.mockReturnValue('false');

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(false);

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(result.current.isDarkMode).toBe(true);
    });

    it('should toggle from dark to light mode', () => {
      localStorageMock.getItem.mockReturnValue('true');

      const { result } = renderHook(() => useDarkMode());

      expect(result.current.isDarkMode).toBe(true);

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(result.current.isDarkMode).toBe(false);
    });

    it('should toggle multiple times correctly', () => {
      const { result } = renderHook(() => useDarkMode());

      const initialMode = result.current.isDarkMode;

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(result.current.isDarkMode).toBe(!initialMode);

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(result.current.isDarkMode).toBe(initialMode);
    });
  });

  describe('system preference tracking', () => {
    it('should set up media query listener', () => {
      renderHook(() => useDarkMode());

      expect(matchMediaMock).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
      expect(mockMediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should update theme when system preference changes and no saved preference', () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      const { result } = renderHook(() => useDarkMode());

      // Get the change handler
      const changeHandler = mockMediaQuery.addEventListener.mock.calls[0][1];

      // Simulate system preference change to dark
      act(() => {
        changeHandler({ matches: true });
      });

      expect(result.current.isDarkMode).toBe(true);
    });

    it('should not update theme when system preference changes but user has saved preference', () => {
      localStorageMock.getItem.mockReturnValue('false'); // User prefers light
      
      const { result } = renderHook(() => useDarkMode());

      // Get the change handler
      const changeHandler = mockMediaQuery.addEventListener.mock.calls[0][1];

      // Simulate system preference change to dark
      act(() => {
        changeHandler({ matches: true });
      });

      // Should remain false because user has explicit preference
      expect(result.current.isDarkMode).toBe(false);
    });

    it('should clean up media query listener on unmount', () => {
      const { unmount } = renderHook(() => useDarkMode());

      unmount();

      expect(mockMediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });

  describe('edge cases', () => {
    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      // Should not throw and should fall back to system preference
      expect(() => {
        renderHook(() => useDarkMode());
      }).not.toThrow();
    });

    it('should handle invalid JSON in localStorage', () => {
      localStorageMock.getItem.mockReturnValue('invalid-json');

      // Should not throw and should fall back to system preference
      expect(() => {
        renderHook(() => useDarkMode());
      }).not.toThrow();
    });

    it('should handle missing matchMedia API', () => {
      matchMediaMock.mockImplementation(() => {
        throw new Error('matchMedia not supported');
      });

      // Should not throw
      expect(() => {
        renderHook(() => useDarkMode());
      }).not.toThrow();
    });

    it('should handle missing document.documentElement', () => {
      Object.defineProperty(document, 'documentElement', {
        value: null,
        writable: true
      });

      // Should not throw
      expect(() => {
        renderHook(() => useDarkMode());
      }).not.toThrow();
    });
  });

  describe('accessibility', () => {
    it('should set proper data-theme attribute for CSS selectors', () => {
      const { result } = renderHook(() => useDarkMode());

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');

      act(() => {
        result.current.toggleDarkMode();
      });

      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('should maintain consistent state between class and attribute', () => {
      const { result } = renderHook(() => useDarkMode());

      // Start with light mode
      expect(document.documentElement.classList.remove).toHaveBeenCalledWith('dark');
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');

      // Toggle to dark mode
      act(() => {
        result.current.toggleDarkMode();
      });

      expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });
  });

  describe('performance', () => {
    it('should not cause unnecessary re-renders', () => {
      const { result, rerender } = renderHook(() => useDarkMode());

      const initialToggle = result.current.toggleDarkMode;

      rerender();

      // Function reference should be stable
      expect(result.current.toggleDarkMode).toBe(initialToggle);
    });

    it('should debounce rapid toggles', () => {
      const { result } = renderHook(() => useDarkMode());

      // Rapid toggles
      act(() => {
        result.current.toggleDarkMode();
        result.current.toggleDarkMode();
        result.current.toggleDarkMode();
      });

      // Should end up in the correct final state
      expect(result.current.isDarkMode).toBe(true);
    });
  });
});