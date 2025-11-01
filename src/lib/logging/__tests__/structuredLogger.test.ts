import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StructuredLogger, LogLevel, LogCategory } from '../structuredLogger';

describe('StructuredLogger Browser Compatibility', () => {
  let originalProcess: any;
  let originalWindow: any;

  beforeEach(() => {
    // Store original globals
    originalProcess = global.process;
    originalWindow = global.window;
    
    // Clear console spies
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original globals
    global.process = originalProcess;
    global.window = originalWindow;
  });

  it('should work in Node.js environment', () => {
    // Simulate Node.js environment
    global.process = {
      env: {
        NODE_ENV: 'test',
        APP_VERSION: '1.0.0'
      },
      versions: { node: '18.0.0' },
      memoryUsage: () => ({ heapUsed: 1000000 })
    } as any;
    
    delete (global as any).window;

    const logger = new StructuredLogger();
    
    // Should not throw errors
    expect(() => {
      logger.info('Test message');
    }).not.toThrow();
  });

  it('should work in browser environment', () => {
    // Simulate browser environment
    delete (global as any).process;
    global.window = {
      performance: {
        memory: {
          usedJSHeapSize: 1000000
        }
      }
    } as any;

    const logger = new StructuredLogger();
    
    // Should not throw errors
    expect(() => {
      logger.info('Test message');
    }).not.toThrow();
  });

  it('should handle missing environment variables gracefully', () => {
    // Simulate environment with no env vars
    delete (global as any).process;
    global.window = {} as any;

    const logger = new StructuredLogger();
    
    // Should use default values
    expect(() => {
      logger.info('Test message');
    }).not.toThrow();
  });

  it('should handle memory usage in different environments', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    // Test Node.js environment
    global.process = {
      env: { NODE_ENV: 'development' },
      versions: { node: '18.0.0' },
      memoryUsage: () => ({ heapUsed: 1000000 })
    } as any;
    delete (global as any).window;

    let logger = new StructuredLogger();
    const timer1 = logger.timer('test');
    timer1.end();

    // Test browser environment
    delete (global as any).process;
    global.window = {
      performance: {
        memory: {
          usedJSHeapSize: 2000000
        }
      }
    } as any;

    logger = new StructuredLogger();
    const timer2 = logger.timer('test');
    timer2.end();

    // Test environment without memory info
    global.window = {} as any;
    logger = new StructuredLogger();
    const timer3 = logger.timer('test');
    timer3.end();

    // All should work without throwing
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('should handle external logging service in different environments', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy;

    // Test with Node.js environment
    global.process = {
      env: {
        NODE_ENV: 'production',
        EXTERNAL_LOG_ENDPOINT: 'https://api.example.com/logs',
        EXTERNAL_LOG_API_KEY: 'test-key'
      },
      versions: { node: '18.0.0' }
    } as any;
    delete (global as any).window;

    let logger = new StructuredLogger();
    logger.info('Test message');

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 0));

    // Test with browser environment
    delete (global as any).process;
    global.window = {} as any;

    logger = new StructuredLogger();
    logger.info('Test message');

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 0));

    // Should work in both environments
    expect(fetchSpy).toHaveBeenCalled();
  });
});