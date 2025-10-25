import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import analysisService from '../analysisService';
import { AnalysisResult } from '../../types/analysis';

// Mock dependencies
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-user-id' } } }
      })
    }
  }
}));

vi.mock('../stripe', () => ({
  getStripe: vi.fn().mockReturnValue({
    customers: {
      create: vi.fn(),
      retrieve: vi.fn()
    },
    subscriptions: {
      create: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn()
    }
  }),
  initializeStripe: vi.fn()
}));

vi.mock('../subscriptionService', () => ({
  subscriptionService: {
    getSubscription: vi.fn().mockResolvedValue({
      plan: 'pro',
      status: 'active'
    })
  }
}));

vi.mock('../subscriptionStatusMonitor', () => ({
  subscriptionStatusMonitor: {
    checkStatus: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../api', () => ({
  createApiClient: vi.fn().mockReturnValue({
    analyzeContent: vi.fn().mockResolvedValue({
      id: 'test-analysis-id',
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
    })
  })
}));

vi.mock('../ragService', () => ({
  default: {
    performRAGAnalysis: vi.fn().mockResolvedValue({
      original_accuracy: 80,
      rag_enhanced_accuracy: 85,
      improvement_score: 5,
      verified_claims: [],
      processing_time: 500
    })
  }
}));

vi.mock('../errors', () => ({
  errorManager: {
    handleError: vi.fn().mockReturnValue(new Error('Test error'))
  },
  withRetry: vi.fn().mockImplementation((fn) => fn())
}));

vi.mock('../serviceDegradationManager', () => ({
  serviceDegradationManager: {
    isOfflineMode: vi.fn().mockReturnValue(false),
    shouldUseFallback: vi.fn().mockReturnValue(false),
    forceFallback: vi.fn()
  }
}));

vi.mock('../subscriptionAccessMiddleware', () => ({
  SubscriptionAccessMiddleware: {
    checkSubscriptionAccess: vi.fn().mockResolvedValue({
      allowed: true,
      subscription: { plan: 'pro', status: 'active' }
    }),
    recordUsage: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../performanceMonitor', () => ({
  performanceMonitor: {
    startOperation: vi.fn().mockReturnValue('perf-id'),
    endOperation: vi.fn(),
    recordBusinessMetric: vi.fn(),
    recordApiCall: vi.fn()
  }
}));

vi.mock('../optimizedAnalysisService', () => ({
  optimizedAnalysisService: {
    batchCreateAnalysisResults: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../offlineCacheManager', () => ({
  offlineCacheManager: {
    getCachedAnalysisResult: vi.fn().mockReturnValue(null),
    cacheAnalysisResult: vi.fn()
  }
}));

vi.mock('../usageTracker', () => ({
  usageTracker: {
    recordApiCall: vi.fn().mockResolvedValue(true)
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
  createUserLogger: vi.fn().mockReturnValue({
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn()
    })
  }),
  logUtils: {
    logPerformance: vi.fn()
  }
}));

vi.mock('../providers/ProviderManager', () => ({
  providerManager: {
    getStatus: vi.fn().mockReturnValue({ initialized: false }),
    initialize: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../providers/ai/AIService', () => ({
  aiService: {
    getStatus: vi.fn().mockReturnValue({ initialized: false }),
    initialize: vi.fn().mockResolvedValue(true),
    analyzeContent: vi.fn().mockResolvedValue({
      id: 'ai-analysis-id',
      accuracy: 90,
      riskLevel: 'low',
      hallucinations: [],
      verificationSources: [],
      processingTime: 1000,
      metadata: {
        provider: 'openai',
        modelVersion: 'gpt-4',
        timestamp: '2024-01-01T00:00:00Z',
        tokenUsage: { total: 100 }
      }
    })
  }
}));

describe('AnalysisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('analyzeContent', () => {
    it('should analyze content and return results', async () => {
      const testContent = 'This is test content for analysis';
      const userId = 'test-user-id';

      const result = await analysisService.analyzeContent(testContent, userId);

      expect(result).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.analysis.id).toBeTruthy();
      expect(result.analysis.accuracy).toBeGreaterThan(0);
      expect(result.analysis.accuracy).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.analysis.riskLevel);
      expect(result.analysis.content).toBeTruthy();
      expect(result.analysis.user_id).toBe(userId);
    });

    it('should handle different sensitivity levels', async () => {
      const testContent = 'Test content';
      const userId = 'test-user-id';

      const sensitivityLevels = ['low', 'medium', 'high'] as const;

      for (const sensitivity of sensitivityLevels) {
        const result = await analysisService.analyzeContent(testContent, userId, {
          sensitivity
        });

        expect(result.analysis).toBeDefined();
        expect(result.analysis.accuracy).toBeGreaterThan(0);
      }
    });

    it('should include RAG analysis when enabled', async () => {
      const testContent = 'Test content for RAG analysis';
      const userId = 'test-user-id';

      const result = await analysisService.analyzeContent(testContent, userId, {
        enableRAG: true
      });

      expect(result.ragAnalysis).toBeDefined();
      expect(result.ragAnalysis.rag_enhanced_accuracy).toBeGreaterThan(0);
      expect(result.ragAnalysis.improvement_score).toBeDefined();
    });

    it('should skip RAG analysis when disabled', async () => {
      const testContent = 'Test content without RAG';
      const userId = 'test-user-id';

      const result = await analysisService.analyzeContent(testContent, userId, {
        enableRAG: false
      });

      expect(result.ragAnalysis).toBeUndefined();
    });

    it('should handle subscription access control', async () => {
      const { SubscriptionAccessMiddleware } = await import('../subscriptionAccessMiddleware');
      
      // Mock denied access
      vi.mocked(SubscriptionAccessMiddleware.checkSubscriptionAccess).mockResolvedValueOnce({
        allowed: false,
        reason: 'quota_exceeded',
        subscription: null
      });

      const testContent = 'Test content';
      const userId = 'test-user-id';

      await expect(
        analysisService.analyzeContent(testContent, userId)
      ).rejects.toThrow();
    });

    it('should handle errors gracefully', async () => {
      const { createApiClient } = await import('../api');
      
      // Mock API error
      vi.mocked(createApiClient).mockReturnValueOnce({
        analyzeContent: vi.fn().mockRejectedValue(new Error('API Error'))
      } as any);

      const testContent = 'Test content';
      const userId = 'test-user-id';

      const result = await analysisService.analyzeContent(testContent, userId);

      // Should fallback to mock analysis
      expect(result.analysis).toBeDefined();
      expect(result.analysis.accuracy).toBeGreaterThan(0);
    });

    it('should validate content length limits', async () => {
      const longContent = 'x'.repeat(1000000); // Very long content
      const userId = 'test-user-id';

      const result = await analysisService.analyzeContent(longContent, userId);

      expect(result.analysis).toBeDefined();
      expect(result.analysis.content.length).toBeLessThanOrEqual(203); // Truncated + ellipsis
    });

    it('should track performance metrics', async () => {
      const { performanceMonitor } = await import('../performanceMonitor');
      
      const testContent = 'Test content';
      const userId = 'test-user-id';

      await analysisService.analyzeContent(testContent, userId);

      expect(performanceMonitor.startOperation).toHaveBeenCalled();
      expect(performanceMonitor.endOperation).toHaveBeenCalled();
      expect(performanceMonitor.recordBusinessMetric).toHaveBeenCalled();
    });
  });

  describe('performStandardAnalysis', () => {
    it('should use AI providers when available', async () => {
      // Mock AI providers as initialized
      analysisService['aiProvidersInitialized'] = true;
      
      const performAIProviderAnalysisSpy = vi.spyOn(
        analysisService as any, 
        'performAIProviderAnalysis'
      ).mockResolvedValue({
        id: 'ai-analysis-id',
        accuracy: 90,
        riskLevel: 'low'
      });

      const result = await analysisService['performStandardAnalysis'](
        'Test content',
        'test-user-id'
      );

      expect(performAIProviderAnalysisSpy).toHaveBeenCalled();
      expect(result.accuracy).toBe(90);
    });

    it('should fallback to legacy API when AI providers fail', async () => {
      analysisService['aiProvidersInitialized'] = true;
      
      vi.spyOn(analysisService as any, 'performAIProviderAnalysis')
        .mockRejectedValue(new Error('AI Provider Error'));

      const result = await analysisService['performStandardAnalysis'](
        'Test content',
        'test-user-id'
      );

      expect(result).toBeDefined();
      expect(result.accuracy).toBeGreaterThan(0);
    });

    it('should use mock analysis as final fallback', async () => {
      analysisService['aiProvidersInitialized'] = false;
      analysisService['apiClient'] = null;

      const result = await analysisService['performStandardAnalysis'](
        'Test content',
        'test-user-id'
      );

      expect(result).toBeDefined();
      expect(result.accuracy).toBeGreaterThan(0);
      expect(result.analysisType).toBe('single');
    });
  });

  describe('mockAnalyzeContent', () => {
    it('should generate realistic mock analysis', async () => {
      const testContent = 'This is test content with some claims that need verification';
      const userId = 'test-user-id';

      const result = await analysisService['mockAnalyzeContent'](testContent, userId);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      expect(result.user_id).toBe(userId);
      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.verificationSources).toBeGreaterThan(0);
      expect(Array.isArray(result.hallucinations)).toBe(true);
    });

    it('should vary results based on content characteristics', async () => {
      const testCases = [
        {
          content: 'This is verified and confirmed information',
          expectedHighAccuracy: true
        },
        {
          content: 'This contains false and misleading claims',
          expectedHighAccuracy: false
        }
      ];

      for (const testCase of testCases) {
        const result = await analysisService['mockAnalyzeContent'](
          testCase.content,
          'test-user-id'
        );

        if (testCase.expectedHighAccuracy) {
          expect(result.accuracy).toBeGreaterThan(70);
          expect(['low', 'medium']).toContain(result.riskLevel);
        } else {
          expect(result.accuracy).toBeLessThan(80);
        }
      }
    });

    it('should generate appropriate hallucinations for suspicious content', async () => {
      const suspiciousContent = 'This content contains unverified claims and false information';
      
      const result = await analysisService['mockAnalyzeContent'](
        suspiciousContent,
        'test-user-id'
      );

      if (result.hallucinations.length > 0) {
        const hallucination = result.hallucinations[0];
        expect(hallucination.text).toBeTruthy();
        expect(hallucination.type).toBeTruthy();
        expect(hallucination.confidence).toBeGreaterThan(0);
        expect(hallucination.confidence).toBeLessThanOrEqual(1);
        expect(hallucination.explanation).toBeTruthy();
        expect(typeof hallucination.startIndex).toBe('number');
        expect(typeof hallucination.endIndex).toBe('number');
      }
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      const { createApiClient } = await import('../api');
      
      vi.mocked(createApiClient).mockReturnValueOnce({
        analyzeContent: vi.fn().mockRejectedValue(new TypeError('Network error'))
      } as any);

      const result = await analysisService.analyzeContent('Test content', 'test-user-id');

      expect(result.analysis).toBeDefined();
      expect(result.analysis.accuracy).toBeGreaterThan(0);
    });

    it('should handle service degradation', async () => {
      const { serviceDegradationManager } = await import('../serviceDegradationManager');
      
      vi.mocked(serviceDegradationManager.shouldUseFallback).mockReturnValue(true);

      const result = await analysisService.analyzeContent('Test content', 'test-user-id');

      expect(result.analysis).toBeDefined();
      expect(result.analysis.accuracy).toBeGreaterThan(0);
    });

    it('should handle RAG analysis failures gracefully', async () => {
      const ragService = await import('../ragService');
      
      vi.mocked(ragService.default.performRAGAnalysis).mockRejectedValue(
        new Error('RAG Service Error')
      );

      const result = await analysisService.analyzeContent('Test content', 'test-user-id', {
        enableRAG: true
      });

      expect(result.analysis).toBeDefined();
      expect(result.ragAnalysis).toBeUndefined();
    });
  });

  describe('caching and offline support', () => {
    it('should use cached results in offline mode', async () => {
      const { serviceDegradationManager } = await import('../serviceDegradationManager');
      const { offlineCacheManager } = await import('../offlineCacheManager');
      
      vi.mocked(serviceDegradationManager.isOfflineMode).mockReturnValue(true);
      
      const cachedResult = {
        analysis: {
          id: 'cached-id',
          accuracy: 88,
          riskLevel: 'low' as const,
          fromCache: true
        }
      };
      
      vi.mocked(offlineCacheManager.getCachedAnalysisResult).mockReturnValue(cachedResult);

      const result = await analysisService.analyzeContent('Test content', 'test-user-id');

      expect(result.analysis.fromCache).toBe(true);
      expect(result.analysis.accuracy).toBe(88);
    });

    it('should cache successful analysis results', async () => {
      const { offlineCacheManager } = await import('../offlineCacheManager');
      
      const cacheAnalysisResultSpy = vi.spyOn(offlineCacheManager, 'cacheAnalysisResult');

      await analysisService.analyzeContent('Test content', 'test-user-id');

      expect(cacheAnalysisResultSpy).toHaveBeenCalled();
    });
  });
});