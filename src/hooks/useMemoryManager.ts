import { useEffect, useRef, useCallback } from 'react';

import { logger } from '../lib/logging';
// Memory management utilities
export class MemoryManager {
  private static instance: MemoryManager;
  private cleanupTasks: Set<() => void> = new Set();
  private memoryPressureHandler?: () => void;

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  // Register a cleanup task
  registerCleanup(task: () => void): () => void {
    this.cleanupTasks.add(task);
    return () => this.cleanupTasks.delete(task);
  }

  // Run all cleanup tasks
  cleanup(): void {
    this.cleanupTasks.forEach(task => {
      try {
        task();
      } catch (error) {
        logger.warn("[MemoryManager] Cleanup task failed:", { error });
      }
    });
    this.cleanupTasks.clear();
  }

  // Handle memory pressure (if supported)
  setupMemoryPressureHandler(handler: () => void): void {
    this.memoryPressureHandler = handler;

    if ('memory' in performance) {
      // Chrome memory pressure API
      (navigator as any).memory.addEventListener?.('pressurechange', () => {
        const memory = (performance as any).memory;
        if (memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.8) {
          logger.warn("[MemoryManager] High memory usage detected");
          handler();
        }
      });
    }
  }

  // Force garbage collection (if available in dev mode)
  forceGC(): void {
    if ('gc' in window && process.env.NODE_ENV === 'development') {
      (window as any).gc();
      logger.debug("[MemoryManager] Forced garbage collection");
    }
  }

  // Get memory usage info
  getMemoryInfo(): {
    used: number;
    total: number;
    limit: number;
    usagePercent: number;
  } | null {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
        usagePercent: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
      };
    }
    return null;
  }
}

// React hook for memory management
export function useMemoryManager() {
  const managerRef = useRef(MemoryManager.getInstance());

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      managerRef.current.cleanup();
    };
  }, []);

  return {
    registerCleanup: useCallback((task: () => void) => {
      return managerRef.current.registerCleanup(task);
    }, []),

    cleanup: useCallback(() => {
      managerRef.current.cleanup();
    }, []),

    forceGC: useCallback(() => {
      managerRef.current.forceGC();
    }, []),

    getMemoryInfo: useCallback(() => {
      return managerRef.current.getMemoryInfo();
    }, []),
  };
}

// Hook for managing component cleanup
export function useCleanup() {
  const cleanupTasksRef = useRef<Set<() => void>>(new Set());

  const addCleanupTask = useCallback((task: () => void) => {
    cleanupTasksRef.current.add(task);
    return () => cleanupTasksRef.current.delete(task);
  }, []);

  useEffect(() => {
    return () => {
      // Run all cleanup tasks on unmount
      cleanupTasksRef.current.forEach(task => {
        try {
          task();
        } catch (error) {
          logger.warn("[useCleanup] Cleanup task failed:", { error });
        }
      });
      cleanupTasksRef.current.clear();
    };
  }, []);

  return { addCleanupTask };
}

// Hook for debounced memory cleanup
export function useDebouncedCleanup(delay: number = 5000) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const { cleanup } = useMemoryManager();

  const scheduleCleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      cleanup();
    }, delay);
  }, [cleanup, delay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { scheduleCleanup };
}

// Utility for cleaning up DOM event listeners
export function createEventListenerCleanup(
  element: Element | Window | Document,
  event: string,
  handler: EventListener
): () => void {
  element.addEventListener(event, handler);
  return () => element.removeEventListener(event, handler);
}

// Utility for cleaning up timeouts
export function createTimeoutCleanup(timeoutId: NodeJS.Timeout): () => void {
  return () => clearTimeout(timeoutId);
}

// Utility for cleaning up intervals
export function createIntervalCleanup(intervalId: NodeJS.Timeout): () => void {
  return () => clearInterval(intervalId);
}

// Utility for cleaning up observers
export function createObserverCleanup(observer: IntersectionObserver | MutationObserver | ResizeObserver): () => void {
  return () => observer.disconnect();
}

// Memory-aware component wrapper
export function withMemoryCleanup<P extends object>(
  Component: React.ComponentType<P>
) {
  return function MemoryManagedComponent(props: P) {
    const { addCleanupTask } = useCleanup();

    // Return enhanced component with cleanup capabilities
    return Component;
  };
}