import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { server } from './mocks/server';
import { setupTestDatabase, cleanupTestDatabase, checkDatabaseHealth } from './utils/database';

// Integration test setup - uses real database and services where possible
beforeAll(async () => {
  // Start MSW server for external API mocking
  server.listen({ onUnhandledRequest: 'warn' }); // Less strict for integration tests
  
  // Set up test database connection
  try {
    await setupTestDatabase();
    console.log('✅ Test database connected successfully');
  } catch (error) {
    console.error('❌ Failed to connect to test database:', error);
    throw error;
  }
  
  // Verify database health
  const isHealthy = await checkDatabaseHealth();
  if (!isHealthy) {
    throw new Error('Test database is not healthy');
  }
  
  // Mock only external services, not internal database operations
  vi.stubEnv('NODE_ENV', 'test');
  
  // Mock console methods to reduce noise in integration tests
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  
  // Mock browser APIs that aren't available in test environment
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

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
});

beforeEach(async () => {
  // Clean up database before each test to ensure isolation
  await cleanupTestDatabase();
});

afterEach(async () => {
  // Clean up DOM after each test
  cleanup();
  
  // Reset MSW handlers to default state
  server.resetHandlers();
  
  // Clean up test data after each test
  await cleanupTestDatabase();
});

afterAll(async () => {
  // Final cleanup
  await cleanupTestDatabase();
  
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
  console.error('Unhandled Rejection in integration test:', promise, 'reason:', reason);
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

// Integration test utilities
export const integrationTestUtils = {
  /**
   * Wait for async operations to complete
   */
  async waitForAsyncOperations(timeout = 5000): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, timeout);
    });
  },

  /**
   * Retry operation with exponential backoff
   */
  async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  },

  /**
   * Wait for database operation to complete
   */
  async waitForDatabaseSync(delay = 100): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delay));
  }
};