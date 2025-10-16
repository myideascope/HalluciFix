/**
 * Tests for the error classification system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiErrorClassifier } from '../classifier';
import { ErrorType, ErrorSeverity, ErrorActionType } from '../types';

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
});

// Mock window.location
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    href: 'https://example.com/test',
    reload: vi.fn()
  }
});

describe('ApiErrorClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigator.onLine = true;
  });

  describe('HTTP Error Classification', () => {
    it('should classify 401 errors as authentication errors', () => {
      const error = {
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Invalid token' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.AUTHENTICATION);
      expect(classification.error.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.error.statusCode).toBe(401);
      expect(classification.error.retryable).toBe(false);
      expect(classification.error.userMessage).toContain('session has expired');
    });

    it('should classify 403 errors as authorization errors', () => {
      const error = {
        response: {
          status: 403,
          statusText: 'Forbidden',
          data: { message: 'Access denied' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.AUTHORIZATION);
      expect(classification.error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.error.statusCode).toBe(403);
      expect(classification.error.retryable).toBe(false);
      expect(classification.error.userMessage).toContain('permission');
    });

    it('should classify 422 errors as validation errors', () => {
      const error = {
        response: {
          status: 422,
          statusText: 'Unprocessable Entity',
          data: { 
            message: 'Validation failed',
            errors: { email: 'Invalid email format' }
          },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.VALIDATION);
      expect(classification.error.severity).toBe(ErrorSeverity.LOW);
      expect(classification.error.statusCode).toBe(422);
      expect(classification.error.retryable).toBe(false);
      expect(classification.error.details).toEqual({ email: 'Invalid email format' });
    });

    it('should classify 429 errors as rate limit errors with retry after', () => {
      const error = {
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          data: { message: 'Rate limit exceeded' },
          headers: { 'retry-after': '60' }
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.RATE_LIMIT);
      expect(classification.error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.error.statusCode).toBe(429);
      expect(classification.error.retryable).toBe(true);
      expect(classification.error.retryAfter).toBe(60000); // 60 seconds in milliseconds
      expect(classification.error.userMessage).toContain('60 seconds');
    });

    it('should classify 500 errors as server errors', () => {
      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Database connection failed' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.SERVER);
      expect(classification.error.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.error.statusCode).toBe(500);
      expect(classification.error.retryable).toBe(true);
      expect(classification.error.userMessage).toContain('technical difficulties');
    });
  });

  describe('Network Error Classification', () => {
    it('should classify offline errors as connectivity errors', () => {
      navigator.onLine = false;

      const error = new Error('Network error');
      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.CONNECTIVITY);
      expect(classification.error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.error.retryable).toBe(true);
      expect(classification.error.userMessage).toContain('internet connection');
    });

    it('should classify timeout errors correctly', () => {
      const error = {
        code: 'ECONNABORTED',
        message: 'Request timeout'
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.TIMEOUT);
      expect(classification.error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.error.retryable).toBe(true);
      expect(classification.error.userMessage).toContain('took too long');
    });

    it('should classify network errors without response', () => {
      const error = {
        code: 'NETWORK_ERROR',
        message: 'Network request failed',
        request: {}
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.NETWORK);
      expect(classification.error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.error.retryable).toBe(true);
      expect(classification.error.userMessage).toContain('connect to our servers');
    });
  });

  describe('Application Error Classification', () => {
    it('should classify analysis errors correctly', () => {
      const error = {
        name: 'AnalysisError',
        message: 'Failed to analyze content',
        userMessage: 'Unable to process the content'
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.ANALYSIS_ERROR);
      expect(classification.error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.error.userMessage).toBe('Unable to process the content');
    });

    it('should classify file processing errors correctly', () => {
      const error = {
        name: 'FileProcessingError',
        message: 'Invalid file format',
        details: { supportedFormats: ['pdf', 'txt'] }
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.FILE_PROCESSING_ERROR);
      expect(classification.error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.error.retryable).toBe(false);
      expect(classification.error.details).toEqual({ supportedFormats: ['pdf', 'txt'] });
    });

    it('should classify Google Drive errors correctly', () => {
      const error = {
        name: 'DriveError',
        message: 'Permission denied',
        type: 'DRIVE_PERMISSION_ERROR'
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.error.type).toBe(ErrorType.GOOGLE_DRIVE_ERROR);
      expect(classification.error.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.error.retryable).toBe(true);
    });
  });

  describe('Error Actions Generation', () => {
    it('should generate retry action for retryable errors', () => {
      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Server error' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.actions).toHaveLength(4); // retry, refresh, contact support, dismiss
      expect(classification.actions[0].type).toBe(ErrorActionType.RETRY);
      expect(classification.actions[0].primary).toBe(true);
    });

    it('should generate login action for authentication errors', () => {
      const error = {
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Invalid token' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      const loginAction = classification.actions.find(a => a.type === ErrorActionType.LOGIN);
      expect(loginAction).toBeDefined();
      expect(loginAction?.primary).toBe(true);
    });

    it('should generate contact support action for high severity errors', () => {
      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Critical system failure' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      const supportAction = classification.actions.find(a => a.type === ErrorActionType.CONTACT_SUPPORT);
      expect(supportAction).toBeDefined();
    });

    it('should always generate dismiss action', () => {
      const error = new Error('Test error');
      const classification = ApiErrorClassifier.classify(error);

      const dismissAction = classification.actions.find(a => a.type === ErrorActionType.DISMISS);
      expect(dismissAction).toBeDefined();
    });
  });

  describe('Error Reporting Logic', () => {
    it('should report critical and high severity errors', () => {
      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Critical failure' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.shouldReport).toBe(true);
      expect(classification.shouldNotifyUser).toBe(true);
    });

    it('should not report validation errors', () => {
      const error = {
        response: {
          status: 422,
          statusText: 'Unprocessable Entity',
          data: { message: 'Validation failed' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.shouldReport).toBe(false);
      expect(classification.shouldNotifyUser).toBe(false); // Low severity
    });

    it('should not report authentication errors', () => {
      const error = {
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Invalid token' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(error);

      expect(classification.shouldReport).toBe(false);
      expect(classification.shouldNotifyUser).toBe(true); // High severity
    });
  });

  describe('Error Context Handling', () => {
    it('should include context information in classified errors', () => {
      const error = new Error('Test error');
      const context = {
        userId: 'user123',
        sessionId: 'session456',
        component: 'TestComponent',
        feature: 'analysis'
      };

      const classification = ApiErrorClassifier.classify(error, context);

      expect(classification.error.userId).toBe('user123');
      expect(classification.error.sessionId).toBe('session456');
      expect(classification.error.context).toEqual(context);
      expect(classification.error.url).toBe('https://example.com/test');
    });

    it('should generate unique error IDs', () => {
      const error = new Error('Test error');
      
      const classification1 = ApiErrorClassifier.classify(error);
      const classification2 = ApiErrorClassifier.classify(error);

      expect(classification1.error.errorId).toBeDefined();
      expect(classification2.error.errorId).toBeDefined();
      expect(classification1.error.errorId).not.toBe(classification2.error.errorId);
    });

    it('should include timestamp in errors', () => {
      const error = new Error('Test error');
      const beforeTime = new Date().toISOString();
      
      const classification = ApiErrorClassifier.classify(error);
      
      const afterTime = new Date().toISOString();

      expect(classification.error.timestamp).toBeDefined();
      expect(classification.error.timestamp >= beforeTime).toBe(true);
      expect(classification.error.timestamp <= afterTime).toBe(true);
    });
  });
});