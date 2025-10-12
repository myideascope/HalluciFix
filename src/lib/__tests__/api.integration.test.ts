import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { server } from '../../test/mocks/server';
import { rest } from 'msw';
import { createApiClient, HalluciFixApi } from '../api';
import type { AnalysisRequest, BatchAnalysisRequest } from '../api';

describe('HalluciFix API Integration Tests', () => {
  let apiClient: HalluciFixApi;
  const mockApiKey = 'test-api-key-12345';
  const baseUrl = 'https://api.hallucifix.com';

  beforeEach(() => {
    apiClient = createApiClient(mockApiKey, baseUrl);
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('API Client Configuration', () => {
    it('should create API client with correct configuration', () => {
      expect(apiClient).toBeInstanceOf(HalluciFixApi);
    });

    it('should use default base URL when not provided', () => {
      const defaultClient = createApiClient(mockApiKey);
      expect(defaultClient).toBeInstanceOf(HalluciFixApi);
    });

    it('should handle custom timeout configuration', () => {
      const customClient = new HalluciFixApi({
        apiKey: mockApiKey,
        baseUrl,
        timeout: 60000
      });
      expect(customClient).toBeInstanceOf(HalluciFixApi);
    });
  });

  describe('Single Content Analysis', () => {
    it('should analyze content successfully', async () => {
      const mockResponse = {
        id: 'analysis-123',
        accuracy: 75.5,
        riskLevel: 'medium',
        processingTime: 1250,
        verificationSources: 8,
        hallucinations: [
          {
            text: 'exactly 99.7% accuracy',
            type: 'False Precision',
            confidence: 0.92,
            explanation: 'Suspiciously specific statistic without verifiable source',
            startIndex: 45,
            endIndex: 67
          }
        ],
        metadata: {
          contentLength: 150,
          timestamp: '2024-01-15T10:30:00Z',
          modelVersion: '1.0.0'
        }
      };

      server.use(
        rest.post(`${baseUrl}/api/v1/analyze`, (req, res, ctx) => {
          return res(ctx.json(mockResponse));
        })
      );

      const request: AnalysisRequest = {
        content: 'Our AI system achieves exactly 99.7% accuracy with zero false positives.',
        options: {
          sensitivity: 'high',
          includeSourceVerification: true,
          maxHallucinations: 10
        }
      };

      const result = await apiClient.analyzeContent(request);

      expect(result).toEqual(mockResponse);
      expect(result.accuracy).toBe(75.5);
      expect(result.riskLevel).toBe('medium');
      expect(result.hallucinations).toHaveLength(1);
    });

    it('should handle different sensitivity levels', async () => {
      const sensitivities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

      for (const sensitivity of sensitivities) {
        server.use(
          rest.post(`${baseUrl}/api/v1/analyze`, async (req, res, ctx) => {
            const body = await req.json();
            expect(body.options.sensitivity).toBe(sensitivity);
            
            return res(ctx.json({
              id: `analysis-${sensitivity}`,
              accuracy: sensitivity === 'high' ? 60 : sensitivity === 'medium' ? 75 : 90,
              riskLevel: sensitivity === 'high' ? 'high' : sensitivity === 'medium' ? 'medium' : 'low',
              processingTime: 1000,
              verificationSources: 5,
              hallucinations: [],
              metadata: {
                contentLength: 100,
                timestamp: new Date().toISOString(),
                modelVersion: '1.0.0'
              }
            }));
          })
        );

        const request: AnalysisRequest = {
          content: 'Test content',
          options: { sensitivity }
        };

        const result = await apiClient.analyzeContent(request);
        expect(result.id).toBe(`analysis-${sensitivity}`);
      }
    });

    it('should handle API errors gracefully', async () => {
      server.use(
        rest.post(`${baseUrl}/api/v1/analyze`, (req, res, ctx) => {
          return res(
            ctx.status(400),
            ctx.json({
              code: 'INVALID_CONTENT',
              message: 'Content is too short for analysis'
            })
          );
        })
      );

      const request: AnalysisRequest = {
        content: 'Short'
      };

      await expect(apiClient.analyzeContent(request)).rejects.toThrow('API Error: Content is too short for analysis');
    });

    it('should handle network timeouts', async () => {
      server.use(
        rest.post(`${baseUrl}/api/v1/analyze`, (req, res, ctx) => {
          return res(ctx.delay(35000)); // Longer than default timeout
        })
      );

      const request: AnalysisRequest = {
        content: 'Test content for timeout'
      };

      await expect(apiClient.analyzeContent(request)).rejects.toThrow('Request timeout');
    });

    it('should include proper headers in requests', async () => {
      server.use(
        rest.post(`${baseUrl}/api/v1/analyze`, (req, res, ctx) => {
          expect(req.headers.get('Authorization')).toBe(`Bearer ${mockApiKey}`);
          expect(req.headers.get('Content-Type')).toBe('application/json');
          expect(req.headers.get('X-API-Version')).toBe('1.0');
          
          return res(ctx.json({
            id: 'test-analysis',
            accuracy: 85,
            riskLevel: 'low',
            processingTime: 500,
            verificationSources: 3,
            hallucinations: [],
            metadata: {
              contentLength: 50,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      const request: AnalysisRequest = {
        content: 'Test content'
      };

      await apiClient.analyzeContent(request);
    });
  });

  describe('Batch Analysis', () => {
    it('should submit batch analysis successfully', async () => {
      const mockResponse = {
        batchId: 'batch-456',
        status: 'processing' as const,
        totalDocuments: 3,
        completedDocuments: 0,
        results: [],
        estimatedTimeRemaining: 180
      };

      server.use(
        rest.post(`${baseUrl}/api/v1/batch/analyze`, (req, res, ctx) => {
          return res(ctx.json(mockResponse));
        })
      );

      const request: BatchAnalysisRequest = {
        documents: [
          { id: 'doc1', content: 'First document content' },
          { id: 'doc2', content: 'Second document content', filename: 'doc2.txt' },
          { id: 'doc3', content: 'Third document content' }
        ],
        options: {
          sensitivity: 'medium',
          includeSourceVerification: true
        }
      };

      const result = await apiClient.submitBatchAnalysis(request);

      expect(result).toEqual(mockResponse);
      expect(result.batchId).toBe('batch-456');
      expect(result.totalDocuments).toBe(3);
    });

    it('should get batch status successfully', async () => {
      const batchId = 'batch-789';
      const mockResponse = {
        batchId,
        status: 'completed' as const,
        totalDocuments: 2,
        completedDocuments: 2,
        results: [
          {
            id: 'analysis-1',
            accuracy: 85.0,
            riskLevel: 'low' as const,
            processingTime: 800,
            verificationSources: 5,
            hallucinations: [],
            metadata: {
              contentLength: 120,
              timestamp: '2024-01-15T10:30:00Z',
              modelVersion: '1.0.0'
            }
          },
          {
            id: 'analysis-2',
            accuracy: 65.5,
            riskLevel: 'medium' as const,
            processingTime: 1200,
            verificationSources: 7,
            hallucinations: [
              {
                text: 'revolutionary breakthrough',
                type: 'Exaggerated Language',
                confidence: 0.85,
                explanation: 'Language suggests potential exaggeration',
                startIndex: 20,
                endIndex: 45
              }
            ],
            metadata: {
              contentLength: 200,
              timestamp: '2024-01-15T10:31:00Z',
              modelVersion: '1.0.0'
            }
          }
        ]
      };

      server.use(
        rest.get(`${baseUrl}/api/v1/batch/${batchId}`, (req, res, ctx) => {
          return res(ctx.json(mockResponse));
        })
      );

      const result = await apiClient.getBatchStatus(batchId);

      expect(result).toEqual(mockResponse);
      expect(result.status).toBe('completed');
      expect(result.results).toHaveLength(2);
    });

    it('should handle batch processing errors', async () => {
      const batchId = 'batch-error';

      server.use(
        rest.get(`${baseUrl}/api/v1/batch/${batchId}`, (req, res, ctx) => {
          return res(
            ctx.status(404),
            ctx.json({
              code: 'BATCH_NOT_FOUND',
              message: 'Batch analysis not found'
            })
          );
        })
      );

      await expect(apiClient.getBatchStatus(batchId)).rejects.toThrow('API Error: Batch analysis not found');
    });

    it('should handle large batch submissions', async () => {
      const largeBatch: BatchAnalysisRequest = {
        documents: Array.from({ length: 100 }, (_, i) => ({
          id: `doc-${i}`,
          content: `Document ${i} content with some test text`,
          filename: `document-${i}.txt`
        }))
      };

      server.use(
        rest.post(`${baseUrl}/api/v1/batch/analyze`, async (req, res, ctx) => {
          const body = await req.json();
          expect(body.documents).toHaveLength(100);
          
          return res(ctx.json({
            batchId: 'large-batch-001',
            status: 'processing',
            totalDocuments: 100,
            completedDocuments: 0,
            results: [],
            estimatedTimeRemaining: 600
          }));
        })
      );

      const result = await apiClient.submitBatchAnalysis(largeBatch);
      expect(result.totalDocuments).toBe(100);
    });
  });

  describe('Analysis History', () => {
    it('should retrieve analysis history with pagination', async () => {
      const mockResponse = {
        analyses: [
          {
            id: 'analysis-1',
            accuracy: 85.0,
            riskLevel: 'low' as const,
            processingTime: 800,
            verificationSources: 5,
            hallucinations: [],
            metadata: {
              contentLength: 120,
              timestamp: '2024-01-15T10:30:00Z',
              modelVersion: '1.0.0'
            }
          }
        ],
        total: 25,
        hasMore: true
      };

      server.use(
        rest.get(`${baseUrl}/api/v1/history`, (req, res, ctx) => {
          const url = new URL(req.url);
          expect(url.searchParams.get('limit')).toBe('10');
          expect(url.searchParams.get('offset')).toBe('0');
          
          return res(ctx.json(mockResponse));
        })
      );

      const result = await apiClient.getAnalysisHistory({
        limit: 10,
        offset: 0
      });

      expect(result).toEqual(mockResponse);
      expect(result.analyses).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });

    it('should retrieve analysis history with date filtering', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      server.use(
        rest.get(`${baseUrl}/api/v1/history`, (req, res, ctx) => {
          const url = new URL(req.url);
          expect(url.searchParams.get('start_date')).toBe(startDate);
          expect(url.searchParams.get('end_date')).toBe(endDate);
          
          return res(ctx.json({
            analyses: [],
            total: 0,
            hasMore: false
          }));
        })
      );

      const result = await apiClient.getAnalysisHistory({
        startDate,
        endDate
      });

      expect(result.analyses).toHaveLength(0);
    });
  });

  describe('Usage Statistics', () => {
    it('should retrieve usage statistics', async () => {
      const mockUsage = {
        requestsToday: 45,
        requestsThisMonth: 1250,
        remainingQuota: 8750,
        quotaResetDate: '2024-02-01T00:00:00Z'
      };

      server.use(
        rest.get(`${baseUrl}/api/v1/usage`, (req, res, ctx) => {
          return res(ctx.json(mockUsage));
        })
      );

      const result = await apiClient.getUsageStats();

      expect(result).toEqual(mockUsage);
      expect(result.requestsToday).toBe(45);
      expect(result.remainingQuota).toBe(8750);
    });

    it('should handle usage statistics errors', async () => {
      server.use(
        rest.get(`${baseUrl}/api/v1/usage`, (req, res, ctx) => {
          return res(
            ctx.status(403),
            ctx.json({
              code: 'INSUFFICIENT_PERMISSIONS',
              message: 'Not authorized to view usage statistics'
            })
          );
        })
      );

      await expect(apiClient.getUsageStats()).rejects.toThrow('API Error: Not authorized to view usage statistics');
    });
  });

  describe('API Key Validation', () => {
    it('should validate API key successfully', async () => {
      const mockValidation = {
        valid: true,
        accountId: 'acc-123',
        plan: 'professional',
        permissions: ['analyze', 'batch', 'history', 'usage']
      };

      server.use(
        rest.get(`${baseUrl}/api/v1/auth/validate`, (req, res, ctx) => {
          return res(ctx.json(mockValidation));
        })
      );

      const result = await apiClient.validateApiKey();

      expect(result).toEqual(mockValidation);
      expect(result.valid).toBe(true);
      expect(result.permissions).toContain('analyze');
    });

    it('should handle invalid API key', async () => {
      server.use(
        rest.get(`${baseUrl}/api/v1/auth/validate`, (req, res, ctx) => {
          return res(
            ctx.status(401),
            ctx.json({
              code: 'INVALID_API_KEY',
              message: 'API key is invalid or expired'
            })
          );
        })
      );

      await expect(apiClient.validateApiKey()).rejects.toThrow('API Error: API key is invalid or expired');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON responses', async () => {
      server.use(
        rest.post(`${baseUrl}/api/v1/analyze`, (req, res, ctx) => {
          return res(ctx.text('Invalid JSON response'));
        })
      );

      const request: AnalysisRequest = {
        content: 'Test content'
      };

      await expect(apiClient.analyzeContent(request)).rejects.toThrow();
    });

    it('should handle HTTP errors without JSON body', async () => {
      server.use(
        rest.post(`${baseUrl}/api/v1/analyze`, (req, res, ctx) => {
          return res(ctx.status(500), ctx.text('Internal Server Error'));
        })
      );

      const request: AnalysisRequest = {
        content: 'Test content'
      };

      await expect(apiClient.analyzeContent(request)).rejects.toThrow('API Error: HTTP 500: Internal Server Error');
    });

    it('should handle network connection errors', async () => {
      server.use(
        rest.post(`${baseUrl}/api/v1/analyze`, (req, res, ctx) => {
          return res.networkError('Network connection failed');
        })
      );

      const request: AnalysisRequest = {
        content: 'Test content'
      };

      await expect(apiClient.analyzeContent(request)).rejects.toThrow();
    });

    it('should handle very large content', async () => {
      const largeContent = 'Large content test. '.repeat(50000); // ~1MB content

      server.use(
        rest.post(`${baseUrl}/api/v1/analyze`, async (req, res, ctx) => {
          const body = await req.json();
          expect(body.content.length).toBeGreaterThan(500000);
          
          return res(ctx.json({
            id: 'large-content-analysis',
            accuracy: 80,
            riskLevel: 'medium',
            processingTime: 5000,
            verificationSources: 10,
            hallucinations: [],
            metadata: {
              contentLength: body.content.length,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      const request: AnalysisRequest = {
        content: largeContent
      };

      const result = await apiClient.analyzeContent(request);
      expect(result.metadata.contentLength).toBeGreaterThan(500000);
    });

    it('should handle concurrent requests', async () => {
      server.use(
        rest.post(`${baseUrl}/api/v1/analyze`, (req, res, ctx) => {
          return res(ctx.json({
            id: `concurrent-${Math.random()}`,
            accuracy: 85,
            riskLevel: 'low',
            processingTime: 1000,
            verificationSources: 5,
            hallucinations: [],
            metadata: {
              contentLength: 100,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      const requests = Array.from({ length: 5 }, (_, i) => ({
        content: `Concurrent test content ${i}`
      }));

      const promises = requests.map(request => apiClient.analyzeContent(request));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.accuracy).toBe(85);
        expect(result.riskLevel).toBe('low');
      });
    });
  });
});