import { useState, useEffect, useCallback } from 'react';

import { logger } from './logging';
export interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isUpdating: boolean;
  isOffline: boolean;
  cacheSize: number;
  registration: ServiceWorkerRegistration | null;
}

export interface ServiceWorkerActions {
  update: () => Promise<void>;
  clearCache: () => Promise<void>;
  getCacheSize: () => Promise<number>;
  skipWaiting: () => void;
}

export function useServiceWorker(): ServiceWorkerState & ServiceWorkerActions {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: 'serviceWorker' in navigator,
    isRegistered: false,
    isUpdating: false,
    isOffline: !navigator.onLine,
    cacheSize: 0,
    registration: null,
  });

  // Update offline status
  useEffect(() => {
    const handleOnline = () => setState(prev => ({ ...prev, isOffline: false }));
    const handleOffline = () => setState(prev => ({ ...prev, isOffline: true }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Register service worker
  useEffect(() => {
    if (!state.isSupported) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });

        setState(prev => ({ ...prev, registration, isRegistered: true }));

        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            setState(prev => ({ ...prev, isUpdating: true }));

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // New version available
                  logger.debug("🔄 New service worker version available");
                } else {
                  // First install
                  logger.debug("✅ Service worker installed");
                }
                setState(prev => ({ ...prev, isUpdating: false }));
              }
            });
          }
        });

        // Listen for messages
        navigator.serviceWorker.addEventListener('message', (event) => {
          const { type, payload } = event.data;

          switch (type) {
            case 'CACHE_CLEARED':
              setState(prev => ({ ...prev, cacheSize: 0 }));
              break;
            case 'OFFLINE_READY':
              logger.debug("📱 App ready for offline use");
              break;
          }
        });

      } catch (error) {
        logger.warn("Service worker registration failed:", { error });
      }
    };

    registerSW();
  }, [state.isSupported]);

  // Update service worker
  const update = useCallback(async () => {
    if (!state.registration) return;

    try {
      await state.registration.update();
    } catch (error) {
      logger.error("Failed to update service worker:", error instanceof Error ? error : new Error(String(error)));
    }
  }, [state.registration]);

  // Clear cache
  const clearCache = useCallback(async () => {
    if (!state.registration?.active) return;

    try {
      state.registration.active.postMessage({ type: 'CLEAR_CACHE' });
    } catch (error) {
      logger.error("Failed to clear cache:", error instanceof Error ? error : new Error(String(error)));
    }
  }, [state.registration]);

  // Get cache size
  const getCacheSize = useCallback(async (): Promise<number> => {
    if (!state.registration?.active) return 0;

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = (event) => {
        const size = event.data.cacheSize || 0;
        setState(prev => ({ ...prev, cacheSize: size }));
        resolve(size);
      };

      state.registration.active.postMessage(
        { type: 'GET_CACHE_SIZE' },
        [messageChannel.port2]
      );
    });
  }, [state.registration]);

  // Skip waiting (activate new version)
  const skipWaiting = useCallback(() => {
    if (!state.registration?.waiting) return;

    state.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }, [state.registration]);

  return {
    ...state,
    update,
    clearCache,
    getCacheSize,
    skipWaiting,
  };
}