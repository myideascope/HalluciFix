import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HalluciFixApi, { createApiClient, getConfiguredApiClient } from '../api';
import type { AnalysisRequest, BatchAnalysisRequest } from '../api';

// Mock dependencies
vi.mock('../config', () => ({
  config: {
    ai: {
      hallucifix: {
        apiKey: 'test-api-key',
        apiUrl: 'https://api.hallucifix.com'
      }
    }
  }
}));

vi.mock('../errors', () => ({
  errorManager: {
    handleError: vi.fn().mockReturnValue(new Error('Handled error'))
  },
  ApiErrorClassifier: {
    classifyError: vi.fn()
  }
}));

vi.mock('../logging', () => ({
  logger: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn()
    })
  },
  createRequestLogger: vi.fn().mockReturnValue({
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn()
    })
  }),
  logUtils: {
    logError: vi.fn()
  }
}));

vi.mock('../performanceMonitor', () => ({
  performanceMonitor: {
    startOperation: vi.fn().mockReturnValue('perf-id'),
    endOperation: vi.fn(),
    recordApiCall: vi.fn()
  }
}));

vi.mock('../logging/middleware', () => ({
  ApiLoggingMiddleware: {
    loggedFetch: vi.fn()
  }
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HalluciFixApi', () => {
  let api: HalluciFixApi;
  const mockConfig = {
    apiKey: 'test-api-key',
    baseUrl: 'https://api.hallucifix.com',
    timeout: 30000
  };

  beforeEach(() => {
    api = new HalluciFixApi(mockConfig);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const customConfig = {
        apiKey: 'custom-key',
        baseUrl: 'https://custom.api.com',
        timeout: 60000
      };

      const customApi = new HalluciFixApi(customConfig);
      expect(customApi).toBeDefined();
    });

    it('should use default timeout when not provided', () => {
      const configWithoutTimeout = {
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com'
      };

      const apiWithDefaults = new HalluciFixApi(configWithoutTimeout);
      expect(apiWithDefaults).toBeDefined();
    });
  });

  describe('makeRequest', () => {
    beforeEach(() => {
      const { ApiLoggingMiddleware } = require('../logging/middleware');
      vi.mocked(ApiLoggingMiddleware.loggedFetch).mockImplementation(
        (url: string, options: any) => {
          return mockFetch(url, options);
        }
      );
    });

    it('should make successful API requests', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await api['makeRequest']('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hallucifix.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
            'X-API-Version': '1.0'
          })
        })
      );

      expect(result).toEqual({ success: true });
    });

    it('should handle HTTP error responses', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({ error: 'Invalid request' }),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      await expect(api['makeRequest']('/test')).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('Network error'));

      await expect(api['makeRequest']('/test')).rejects.toThrow();
    });

    it('should include request timeout', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      await api['makeRequest']('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      );
    });

    it('should handle different HTTP methods', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ created: true }),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const testData = { test: 'data' };
      await api['makeRequest']('/test', {
        method: 'POST',
        body: JSON.stringify(testData)
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(testData)
        })
      );
    });
  });

  describe('analyzeContent', () => {
    it('should analyze content successfully', async () => {
      const mockAnalysisResponse = {
        id: 'analysis-123',
        accuracy: 85,
        riskLevel: 'low',
        processingTime: 1500,
        verificationSources: 3,
        hallucinations: [],
        metadata: {
          contentLength: 100,
          timestamp: '2024-01-01T00:00:00Z',
          modelVersion: 'v1.0'
        }
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockAnalysisResponse),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const request: AnalysisRequest = {
        content: 'Test content for analysis',
        options: {
          sensitivity: 'medium',
          includeSourceVerification: true,
          maxHallucinations: 5
        }
      };

      const result = await api.analyzeContent(request);

      expect(result).toEqual(mockAnalysisResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hallucifix.com/api/v1/analyze',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request)
        })
      );
    });

    it('should handle analysis with different sensitivity levels', async () => {
      const sensitivityLevels = ['low', 'medium', 'high'] as const;

      for (const sensitivity of sensitivityLevels) {
        const mockResponse = {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            id: `analysis-${sensitivity}`,
            accuracy: 80,
            riskLevel: 'medium'
          }),
          headers: new Headers()
        };

        mockFetch.mockResolvedValue(mockResponse);

        const request: AnalysisRequest = {
          content: 'Test content',
          options: { sensitivity }
        };

        const result = await api.analyzeContent(request);
        expect(result.id).toBe(`analysis-${sensitivity}`);
      }
    });

    it('should handle analysis errors', async () => {
      const mockResponse = {
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: vi.fn().mockResolvedValue({
          error: 'Content too long',
          code: 'CONTENT_TOO_LONG'
        }),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const request: AnalysisRequest = {
        content: 'x'.repeat(1000000) // Very long content
      };

      await expect(api.analyzeContent(request)).rejects.toThrow();
    });
  });

  describe('submitBatchAnalysis', () => {
    it('should submit batch analysis successfully', async () => {
      const mockBatchResponse = {
        batchId: 'batch-123',
        status: 'processing',
        totalDocuments: 3,
        completedDocuments: 0,
        results: [],
        estimatedTimeRemaining: 300
      };

      const mockResponse = {
        ok: true,
        status: 202,
        json: vi.fn().mockResolvedValue(mockBatchResponse),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const request: BatchAnalysisRequest = {
        documents: [
          { id: 'doc1', content: 'First document' },
          { id: 'doc2', content: 'Second document' },
          { id: 'doc3', content: 'Third document' }
        ],
        options: {
          sensitivity: 'medium'
        }
      };

      const result = await api.submitBatchAnalysis(request);

      expect(result).toEqual(mockBatchResponse);
      expect(result.totalDocuments).toBe(3);
      expect(result.status).toBe('processing');
    });

    it('should handle empty document list', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({
          error: 'No documents provided'
        }),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const request: BatchAnalysisRequest = {
        documents: []
      };

      await expect(api.submitBatchAnalysis(request)).rejects.toThrow();
    });
  });

  describe('getBatchStatus', () => {
    it('should get batch status successfully', async () => {
      const mockStatusResponse = {
        batchId: 'batch-123',
        status: 'completed',
        totalDocuments: 3,
        completedDocuments: 3,
        results: [
          { id: 'analysis-1', accuracy: 85 },
          { id: 'analysis-2', accuracy: 92 },
          { id: 'analysis-3', accuracy: 78 }
        ]
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockStatusResponse),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getBatchStatus('batch-123');

      expect(result).toEqual(mockStatusResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hallucifix.com/api/v1/batch/batch-123',
        expect.any(Object)
      );
    });

    it('should handle non-existent batch ID', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({
          error: 'Batch not found'
        }),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      await expect(api.getBatchStatus('non-existent')).rejects.toThrow();
    });
  });

  describe('getAnalysisHistory', () => {
    it('should get analysis history with default parameters', async () => {
      const mockHistoryResponse = {
        analyses: [
          { id: 'analysis-1', accuracy: 85, timestamp: '2024-01-01T00:00:00Z' },
          { id: 'analysis-2', accuracy: 92, timestamp: '2024-01-02T00:00:00Z' }
        ],
        total: 25,
        hasMore: true
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockHistoryResponse),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getAnalysisHistory();

      expect(result).toEqual(mockHistoryResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hallucifix.com/api/v1/history',
        expect.any(Object)
      );
    });

    it('should get analysis history with custom parameters', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          analyses: [],
          total: 0,
          hasMore: false
        }),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const params = {
        limit: 5,
        offset: 10,
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      await api.getAnalysisHistory(params);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hallucifix.com/api/v1/history?limit=5&offset=10&start_date=2024-01-01&end_date=2024-01-31',
        expect.any(Object)
      );
    });
  });

  describe('getUsageStats', () => {
    it('should get usage statistics successfully', async () => {
      const mockUsageResponse = {
        requestsToday: 45,
        requestsThisMonth: 1250,
        remainingQuota: 8750,
        quotaResetDate: '2024-02-01T00:00:00Z'
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockUsageResponse),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.getUsageStats();

      expect(result).toEqual(mockUsageResponse);
      expect(result.requestsToday).toBeGreaterThanOrEqual(0);
      expect(result.remainingQuota).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key successfully', async () => {
      const mockValidationResponse = {
        valid: true,
        accountId: 'acc-123',
        plan: 'pro',
        permissions: ['analyze', 'batch', 'history']
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockValidationResponse),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await api.validateApiKey();

      expect(result).toEqual(mockValidationResponse);
      expect(result.valid).toBe(true);
      expect(Array.isArray(result.permissions)).toBe(true);
    });

    it('should handle invalid API key', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({
          valid: false,
          error: 'Invalid API key'
        }),
        headers: new Headers()
      };

      mockFetch.mockResolvedValue(mockResponse);

      await expect(api.validateApiKey()).rejects.toThrow();
    });
  });
});

describe('API Client Factory Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createApiClient', () => {
    it('should create API client with provided parameters', () => {
      const client = createApiClient('custom-key', 'https://custom.api.com');
      
      expect(client).toBeInstanceOf(HalluciFixApi);
    });

    it('should create API client with config fallback', () => {
      const client = createApiClient();
      
      expect(client).toBeInstanceOf(HalluciFixApi);
    });

    it('should return null when no API key is available', () => {
      // Mock config without API key
      vi.doMock('../config', () => ({
        config: {
          ai: {
            hallucifix: {
              apiKey: undefined
            }
          }
        }
      }));

      const client = createApiClient();
      
      expect(client).toBeNull();
    });
  });

  describe('getConfiguredApiClient', () => {
    it('should return configured API client', () => {
      const client = getConfiguredApiClient();
      
      expect(client).toBeInstanceOf(HalluciFixApi);
    });

    it('should return null when configuration is missing', () => {
      // Mock missing configuration
      vi.doMock('../config', () => ({
        config: {
          ai: {}
        }
      }));

      const client = getConfiguredApiClient();
      
      expect(client).toBeNull();
    });
  });
});

describe('Error Handling and Resilience', () => {
  let api: HalluciFixApi;

  beforeEach(() => {
    api = new HalluciFixApi({
      apiKey: 'test-key',
      baseUrl: 'https://api.test.com'
    });

    const { ApiLoggingMiddleware } = require('../logging/middleware');
    vi.mocked(ApiLoggingMiddleware.loggedFetch).mockImplementation(
      (url: string, options: any) => mockFetch(url, options)
    );

    vi.clearAllMocks();
  });

  it('should handle rate limiting errors', async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: vi.fn().mockResolvedValue({
        error: 'Rate limit exceeded'
      }),
      headers: new Headers({
        'Retry-After': '60',
        'X-RateLimit-Remaining': '0'
      })
    };

    mockFetch.mockResolvedValue(mockResponse);

    await expect(api.analyzeContent({ content: 'test' })).rejects.toThrow();
  });

  it('should handle server errors', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: vi.fn().mockResolvedValue({
        error: 'Server error'
      }),
      headers: new Headers()
    };

    mockFetch.mockResolvedValue(mockResponse);

    await expect(api.analyzeContent({ content: 'test' })).rejects.toThrow();
  });

  it('should handle timeout errors', async () => {
    // Mock timeout by rejecting with AbortError
    mockFetch.mockRejectedValue(new DOMException('Timeout', 'AbortError'));

    await expect(api.analyzeContent({ content: 'test' })).rejects.toThrow();
  });

  it('should handle malformed JSON responses', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('Invalid JSON')),
      headers: new Headers()
    };

    mockFetch.mockResolvedValue(mockResponse);

    await expect(api.analyzeContent({ content: 'test' })).rejects.toThrow();
  });
});