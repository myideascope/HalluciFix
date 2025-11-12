// Service Worker for HalluciFix - Caching and Offline Support
const CACHE_NAME = 'hallucifix-v1.0.0';
const STATIC_CACHE = 'hallucifix-static-v1.0.0';
const API_CACHE = 'hallucifix-api-v1.0.0';
const IMAGE_CACHE = 'hallucifix-images-v1.0.0';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/index.css',
  '/vite.svg'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/health',
  '/api/config',
  '/api/user/profile'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS).catch(error => {
          console.warn('[SW] Failed to cache some static assets:', error);
          // Continue with partial cache
        });
      }),
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE && cacheName !== IMAGE_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip external requests (CDNs, external APIs)
  if (!url.origin.includes(self.location.origin) &&
      !url.origin.includes('fonts.googleapis.com') &&
      !url.origin.includes('fonts.gstatic.com')) {
    return;
  }

  // Handle different types of requests
  if (request.destination === 'document') {
    // HTML pages - Network first, fallback to cache
    event.respondWith(networkFirst(request, STATIC_CACHE));
  } else if (request.destination === 'script' || request.destination === 'style') {
    // JS/CSS - Cache first, fallback to network
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (request.destination === 'image') {
    // Images - Cache first with stale-while-revalidate
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
  } else if (url.pathname.startsWith('/api/')) {
    // API calls - Network first with cache fallback
    event.respondWith(networkFirst(request, API_CACHE));
  } else {
    // Other resources - Cache first
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

// Cache-first strategy
async function cacheFirst(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first failed:', error);
    // Return offline fallback for critical resources
    if (request.destination === 'document') {
      const cache = await caches.open(STATIC_CACHE);
      return cache.match('/index.html');
    }
    throw error;
  }
}

// Network-first strategy
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', error);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline page for navigation requests
    if (request.destination === 'document') {
      const cache = await caches.open(STATIC_CACHE);
      return cache.match('/index.html');
    }

    throw error;
  }
}

// Stale-while-revalidate strategy for images
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  });

  return cachedResponse || fetchPromise;
}

// Background sync for failed requests
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'background-sync') {
    event.waitUntil(syncFailedRequests());
  }
});

// Sync failed requests
async function syncFailedRequests() {
  try {
    const cache = await caches.open('failed-requests');
    const keys = await cache.keys();

    await Promise.all(
      keys.map(async (request) => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            console.log('[SW] Successfully synced failed request:', request.url);
            await cache.delete(request);
          }
        } catch (error) {
          console.error('[SW] Failed to sync request:', request.url, error);
        }
      })
    );
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Message handling for cache management
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      clearAllCaches();
      break;

    case 'GET_CACHE_SIZE':
      getCacheSize().then(size => {
        event.ports[0].postMessage({ cacheSize: size });
      });
      break;

    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// Clear all caches
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
  console.log('[SW] All caches cleared');
}

// Get total cache size
async function getCacheSize() {
  let totalSize = 0;
  const cacheNames = await caches.keys();

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    for (const request of keys) {
      try {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      } catch (error) {
        console.warn('[SW] Error calculating cache size:', error);
      }
    }
  }

  return totalSize;
}

// Periodic cache cleanup
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'cache-cleanup') {
    event.waitUntil(cleanupOldCache());
  }
});

async function cleanupOldCache() {
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const cacheNames = await caches.keys();

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    await Promise.all(
      keys.map(async (request) => {
        try {
          const response = await cache.match(request);
          if (response) {
            const date = response.headers.get('date');
            if (date && (Date.now() - new Date(date).getTime()) > maxAge) {
              await cache.delete(request);
            }
          }
        } catch (error) {
          console.warn('[SW] Error during cache cleanup:', error);
        }
      })
    );
  }

  console.log('[SW] Cache cleanup completed');
}