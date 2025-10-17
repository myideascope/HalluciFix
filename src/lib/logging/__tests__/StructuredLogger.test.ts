/**
 * Tests for Structured Logger
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StructuredLogger } from '../StructuredLogger';
import { LogLevel, LogContext } from '../types';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger = new StructuredLogger({
      serviceName: 'test-service',
      version: '1.0.0',
      environment: 'test',
      logLevel: 'debug',
      enableConsole: true,
      enableExternalService: false,
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    logger.destroy();
  });

  it('should create properly formatted log entries', () => {
    const testMessage = 'Test message';
    const testContext: LogContext = { userId: 'test-user' };

    logger.info(testMessage, testContext);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logCall = consoleSpy.mock.calls[0][0];
    const logEntry = JSON.parse(logCall);

    expect(logEntry).toMatchObject({
      level: 'info',
      message: testMessage,
      service: 'test-service',
      version: '1.0.0',
      environment: 'test',
      context: { userId: 'test-user' },
    });

    expect(logEntry.timestamp).toBeDefined();
    expect(new Date(logEntry.timestamp)).toBeInstanceOf(Date);
  });

  it('should respect log levels', () => {
    const debugLogger = new StructuredLogger({
      logLevel: 'warn',
      enableConsole: true,
      enableExternalService: false,
    });

    debugLogger.debug('Debug message');
    debugLogger.info('Info message');
    debugLogger.warn('Warning message');
    debugLogger.error('Error message');

    // Only warn and error should be logged
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    
    debugLogger.destroy();
  });

  it('should sanitize sensitive information', () => {
    const sensitiveContext: LogContext = {
      userId: 'test-user',
      password: 'secret123',
      apiKey: 'api-key-123',
      token: 'bearer-token',
    };

    logger.info('Test with sensitive data', sensitiveContext);

    const logCall = consoleSpy.mock.calls[0][0];
    const logEntry = JSON.parse(logCall);

    expect(logEntry.context).toMatchObject({
      userId: 'test-user',
      password: '[REDACTED]',
      apiKey: '[REDACTED]',
      token: '[REDACTED]',
    });
  });

  it('should handle errors properly', () => {
    const testError = new Error('Test error');
    testError.stack = 'Error: Test error\n    at test';

    logger.error('Error occurred', testError);

    const logCall = consoleSpy.mock.calls[0][0];
    const logEntry = JSON.parse(logCall);

    expect(logEntry.error).toMatchObject({
      name: 'Error',
      message: 'Test error',
      stack: 'Error: Test error\n    at test',
    });
  });

  it('should create child loggers with additional context', () => {
    const childContext: LogContext = { component: 'TestComponent' };
    const childLogger = logger.child(childContext);

    childLogger.info('Child logger message', { action: 'test' });

    const logCall = consoleSpy.mock.calls[0][0];
    const logEntry = JSON.parse(logCall);

    expect(logEntry.context).toMatchObject({
      component: 'TestComponent',
      action: 'test',
    });
  });

  it('should support all log levels', () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');

    expect(consoleSpy).toHaveBeenCalledTimes(4);

    const levels = consoleSpy.mock.calls.map(call => {
      const logEntry = JSON.parse(call[0]);
      return logEntry.level;
    });

    expect(levels).toEqual(['debug', 'info', 'warn', 'error']);
  });
});