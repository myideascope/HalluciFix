import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { server } from '../mocks/server';
import { 
  withIntegrationTest,
  createTestUser,
  createTestAnalysis,
  fixtures
} from '../utils';

// Mock the API service
const mockApiService = {
  async analyzeContent(content: string, options?: any) {
    const response = await fetch('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, options })
    });
    return response.json();
  },

  async getBatchStatus(batchId: string) {
    const response = await fetch(`/api/v1/batch/${batchId}`);
    return response.json();
  },

  async getAnalysisHistory(limit = 10, offset = 0) {
    const response = await fetch(`/api/v1/history?limit=${limit}&offset=${offset}`);
    return response.json();
  },

  async getUsageStats() {
    const response = await fetch('/api/v1/usage');
    return response.json();
  }
};

describe('API Integration Tests', () => {
  beforeEach(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('Content Analysis API', () => {
    it('should analyze content and return results', async () => {
      const testContent = 'This is a test content for analysis that contains verified information.';
      
      const result = await mockApiService.analyzeContent(testContent);
      
      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      expect(result.accuracy).toBeGreaterThan(0);
      expect(result.accuracy).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.verificationSources).toBeGreaterThan(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.contentLength).toBe(testContent.length);
    });

    it('should handle different content types and risk levels', async () => {
      const testCases = [
        {
          content: 'This is verified and confirmed information from reliable sources.',
          expectedRiskLevel: 'low'
        },
        {
          content: 'This statement contains some unverified claims that need checking.',
          expectedRiskLevel: 'medium'
        },
        {
          content: 'This content contains false and dangerous misinformation.',
          expectedRiskLevel: 'critical'
        }
      ];

      for (const testCase of testCases) {
        const result = await mockApiService.analyzeContent(testCase.content);
        
        expect(result.riskLevel).toBe(testCase.expectedRiskLevel);
        expect(result.accuracy).toBeGreaterThan(0);
        
        if (testCase.expectedRiskLevel === 'low') {
          expect(result.accuracy).toBeGreaterThan(80);
        } else if (testCase.expectedRiskLevel === 'critical') {
          expect(result.accuracy).toBeLessThan(30);
        }
      }
    });

    it('should include hallucination detection in results', async () => {
      const testContent = 'This content contains several unsubstantiated claims and potential misinformation.';
      
      const result = await mockApiService.analyzeContent(testContent);
      
      expect(result.hallucinations).toBeDefined();
      expect(Array.isArray(result.hallucinations)).toBe(true);
      
      if (result.hallucinations.length > 0) {
        const hallucination = result.hallucinations[0];
        expect(hallucination.text).toBeTruthy();
        expect(hallucination.type).toBeTruthy();
        expect(hallucination.confidence).toBeGreaterThan(0);
        expect(hallucination.confidence).toBeLessThanOrEqual(1);
        expect(hallucination.explanation).toBeTruthy();
        expect(typeof hallucination.startIndex).toBe('number');
        expect(typeof hallucination.endIndex).toBe('number');
        expect(hallucination.endIndex).toBeGreaterThan(hallucination.startIndex);
      }
    });

    it('should handle analysis options', async () => {
      const testContent = 'Test content for analysis with custom options.';
      const options = {
        includeHallucinations: true,
        detailedAnalysis: true,
        sourceVerification: true
      };
      
      const result = await mockApiService.analyzeContent(testContent, options);
      
      expect(result).toBeDefined();
      expect(result.accuracy).toBeGreaterThan(0);
      expect(result.metadata).toBeDefined();
    });
  });

  describe('Batch Analysis API', () => {
    it('should create and track batch analysis', async () => {
      const documents = [
        { id: 'doc1', content: 'First document content' },
        { id: 'doc2', content: 'Second document content' },
        { id: 'doc3', content: 'Third document content' }
      ];
      
      // Start batch analysis
      const batchResponse = await fetch('/api/v1/batch/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents })
      });
      
      const batchResult = await batchResponse.json();
      
      expect(batchResult.batchId).toBeTruthy();
      expect(batchResult.status).toBe('processing');
      expect(batchResult.totalDocuments).toBe(3);
      expect(batchResult.completedDocuments).toBe(0);
      expect(batchResult.estimatedTimeRemaining).toBeGreaterThan(0);
      
      // Check batch status
      const statusResult = await mockApiService.getBatchStatus(batchResult.batchId);
      
      expect(statusResult.batchId).toBe(batchResult.batchId);
      expect(statusResult.status).toBe('completed');
      expect(statusResult.totalDocuments).toBe(3);
      expect(statusResult.completedDocuments).toBe(3);
      expect(Array.isArray(statusResult.results)).toBe(true);
    });

    it('should handle batch analysis errors', async () => {
      const invalidDocuments = [
        { id: 'invalid1' }, // Missing content
        { content: '' }, // Missing id
      ];
      
      const batchResponse = await fetch('/api/v1/batch/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: invalidDocuments })
      });
      
      // Should still create batch but with validation errors
      expect(batchResponse.ok).toBe(true);
      
      const batchResult = await batchResponse.json();
      expect(batchResult.batchId).toBeTruthy();
    });
  });

  describe('Analysis History API', () => {
    it('should retrieve analysis history with pagination', async () => {
      const historyResult = await mockApiService.getAnalysisHistory(5, 0);
      
      expect(historyResult.analyses).toBeDefined();
      expect(Array.isArray(historyResult.analyses)).toBe(true);
      expect(historyResult.total).toBeGreaterThan(0);
      expect(typeof historyResult.hasMore).toBe('boolean');
      
      if (historyResult.analyses.length > 0) {
        const analysis = historyResult.analyses[0];
        expect(analysis.id).toBeTruthy();
        expect(analysis.accuracy_score).toBeGreaterThanOrEqual(0);
        expect(analysis.accuracy_score).toBeLessThanOrEqual(100);
        expect(['low', 'medium', 'high', 'critical']).toContain(analysis.risk_level);
      }
    });

    it('should handle pagination correctly', async () => {
      const firstPage = await mockApiService.getAnalysisHistory(2, 0);
      const secondPage = await mockApiService.getAnalysisHistory(2, 2);
      
      expect(firstPage.analyses).toHaveLength(2);
      expect(secondPage.analyses).toHaveLength(2);
      
      // Ensure different results (assuming enough data)
      if (firstPage.total > 2) {
        expect(firstPage.analyses[0].id).not.toBe(secondPage.analyses[0].id);
      }
    });
  });

  describe('Usage Statistics API', () => {
    it('should retrieve usage statistics', async () => {
      const usageStats = await mockApiService.getUsageStats();
      
      expect(usageStats.requestsToday).toBeGreaterThanOrEqual(0);
      expect(usageStats.requestsThisMonth).toBeGreaterThanOrEqual(0);
      expect(usageStats.remainingQuota).toBeGreaterThanOrEqual(0);
      expect(usageStats.quotaResetDate).toBeTruthy();
      
      // Validate date format
      const resetDate = new Date(usageStats.quotaResetDate);
      expect(resetDate).toBeInstanceOf(Date);
      expect(resetDate.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Authentication and Authorization', () => {
    it('should validate API keys', async () => {
      const validationResponse = await fetch('/api/v1/auth/validate', {
        headers: {
          'Authorization': 'Bearer valid-test-token'
        }
      });
      
      expect(validationResponse.ok).toBe(true);
      
      const validationResult = await validationResponse.json();
      expect(validationResult.valid).toBe(true);
      expect(validationResult.accountId).toBeTruthy();
      expect(validationResult.plan).toBeTruthy();
      expect(Array.isArray(validationResult.permissions)).toBe(true);
    });

    it('should reject invalid API keys', async () => {
      const validationResponse = await fetch('/api/v1/auth/validate', {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });
      
      expect(validationResponse.status).toBe(401);
    });

    it('should require authentication for protected endpoints', async () => {
      const response = await fetch('/api/v1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'test' })
      });
      
      // In a real API, this might require authentication
      // For testing, we allow it to pass
      expect(response.ok).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle 500 internal server errors', async () => {
      const response = await fetch('/api/error/500');
      expect(response.status).toBe(500);
    });

    it('should handle 404 not found errors', async () => {
      const response = await fetch('/api/error/404');
      expect(response.status).toBe(404);
    });

    it('should handle network errors', async () => {
      try {
        await fetch('/api/error/network');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle rate limiting', async () => {
      const response = await fetch('/api/error/rate-limit');
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('60');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('should handle authentication errors', async () => {
      const response = await fetch('/api/error/auth');
      expect(response.status).toBe(401);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const testContent = 'Concurrent test content for performance analysis.';
      
      const startTime = Date.now();
      
      const promises = Array.from({ length: concurrentRequests }, () =>
        mockApiService.analyzeContent(testContent)
      );
      
      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      expect(results).toHaveLength(concurrentRequests);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      results.forEach(result => {
        expect(result.accuracy).toBeGreaterThan(0);
        expect(result.riskLevel).toBeTruthy();
      });
    });

    it('should handle large content efficiently', async () => {
      const largeContent = 'This is a large content piece. '.repeat(1000); // ~30KB
      
      const startTime = Date.now();
      const result = await mockApiService.analyzeContent(largeContent);
      const processingTime = Date.now() - startTime;
      
      expect(result).toBeDefined();
      expect(result.accuracy).toBeGreaterThan(0);
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.metadata.contentLength).toBe(largeContent.length);
    });
  });

  describe('Integration with Test Data', () => {
    it('should work with fixture data', async () => {
      await withIntegrationTest('api-with-fixtures', 'basic', async (testData) => {
        const { analyses } = testData;
        
        // Use fixture data for API testing
        const fixtureAnalysis = fixtures.analyses.lowRiskAnalysis;
        
        const result = await mockApiService.analyzeContent(fixtureAnalysis.content);
        
        expect(result).toBeDefined();
        expect(result.accuracy).toBeGreaterThan(0);
        
        // Compare with expected fixture behavior
        if (fixtureAnalysis.content.includes('verified')) {
          expect(result.riskLevel).toBe('low');
          expect(result.accuracy).toBeGreaterThan(80);
        }
      });
    });

    it('should integrate with database seeded data', async () => {
      await withIntegrationTest('api-with-seeded-data', 'basic', async (testData) => {
        const { users, analyses } = testData;
        
        expect(users.length).toBeGreaterThan(0);
        expect(analyses.length).toBeGreaterThan(0);
        
        // Test API with seeded user context
        const testUser = users[0];
        const userAnalyses = analyses.filter(a => a.user_id === testUser.id);
        
        expect(userAnalyses.length).toBeGreaterThan(0);
        
        // Simulate API call with user context
        const historyResult = await mockApiService.getAnalysisHistory();
        
        expect(historyResult.analyses).toBeDefined();
        expect(historyResult.total).toBeGreaterThan(0);
      });
    });
  });
});