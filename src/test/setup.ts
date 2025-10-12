import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './mocks/server';

// Global test setup
beforeAll(() => {
  // Start MSW server
  server.listen({ onUnhandledRequest: 'error' });
  
  // Mock environment variables for tests
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('VITE_HALLUCIFIX_API_KEY', 'test-api-key');
  
  // Mock console methods to reduce noise in tests
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  
  // Mock window.matchMedia for responsive components
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  vi.stubGlobal('localStorage', localStorageMock);

  // Mock fetch for any requests not handled by MSW
  global.fetch = vi.fn();
});

afterEach(() => {
  // Clean up DOM after each test
  cleanup();
  
  // Reset MSW handlers to default state
  server.resetHandlers();
  
  // Clear all mocks
  vi.clearAllMocks();
  
  // Reset modules to ensure clean state
  vi.resetModules();
});

afterAll(() => {
  // Stop MSW server
  server.close();
  
  // Restore all mocks
  vi.restoreAllMocks();
  
  // Restore environment variables
  vi.unstubAllEnvs();
});

// Global error handler for unhandled promise rejections
const originalUnhandledRejection = process.listeners('unhandledRejection');
process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Re-throw to fail the test
  throw reason;
});

// Restore original handlers after tests
afterAll(() => {
  process.removeAllListeners('unhandledRejection');
  originalUnhandledRejection.forEach(listener => {
    process.on('unhandledRejection', listener);
  });
});