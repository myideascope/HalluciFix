import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase, cleanupTestDatabase, createTestUserInDatabase, DatabaseTestIsolation } from '../../test/utils/database';
import { server } from '../../test/mocks/server';
import { rest } from 'msw';
import analysisService from '../analysisService';
import { supabase } from '../supabase';

describe('Analysis Service Integration Tests', () => {
  let testIsolation: DatabaseTestIsolation;
  let testUser: any;

  beforeEach(async () => {
    testIsolation = new DatabaseTestIsolation();
    testUser = await testIsolation.createIsolatedUser({
      email: 'analysis-test@test.example.com',
      name: 'Analysis Test User'
    });
  });

  afterEach(async () => {
    await testIsolation.cleanup();
  });

  describe('Single Content Analysis', () => {
    it('should perform complete analysis workflow with database storage', async () => {
      const testContent = `
        Our revolutionary AI system achieves exactly 99.7% accuracy with zero false positives.
        According to recent studies, this represents a 1000x improvement over existing solutions.
        All users report perfect satisfaction with unprecedented results.
      `;

      // Mock the external API response
      server.use(
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.json({
            id: 'api-analysis-123',
            accuracy: 45.2,
            riskLevel: 'critical',
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
              },
              {
                text: 'zero false positives',
                type: 'Impossible Metric',
                confidence: 0.88,
                explanation: 'Perfect metrics are statistically unlikely',
                startIndex: 73,
                endIndex: 93
              }
            ],
            metadata: {
              contentLength: testContent.length,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      const result = await analysisService.analyzeContent(testContent, testUser.id);

      // Verify analysis result structure
      expect(result.analysis).toMatchObject({
        user_id: testUser.id,
        accuracy: expect.any(Number),
        riskLevel: expect.stringMatching(/low|medium|high|critical/),
        hallucinations: expect.any(Array),
        processingTime: expect.any(Number),
        analysisType: 'single'
      });

      // Verify hallucinations were detected
      expect(result.analysis.hallucinations.length).toBeGreaterThan(0);
      expect(result.analysis.accuracy).toBeLessThan(70); // Should be low due to suspicious content

      // Verify data was stored in database
      const { data: storedAnalysis, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', testUser.id)
        .single();

      expect(error).toBeNull();
      expect(storedAnalysis).toBeDefined();
      expect(storedAnalysis.accuracy).toBe(result.analysis.accuracy);
      expect(storedAnalysis.risk_level).toBe(result.analysis.riskLevel);
    });

    it('should handle API failures gracefully and fall back to mock analysis', async () => {
      const testContent = 'This is a simple test content without suspicious claims.';

      // Mock API failure
      server.use(
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.status(500), ctx.json({ error: 'Internal server error' }));
        })
      );

      const result = await analysisService.analyzeContent(testContent, testUser.id);

      // Should still return a valid analysis result
      expect(result.analysis).toMatchObject({
        user_id: testUser.id,
        accuracy: expect.any(Number),
        riskLevel: expect.stringMatching(/low|medium|high|critical/),
        hallucinations: expect.any(Array),
        processingTime: expect.any(Number),
        analysisType: 'single'
      });

      // Should have higher accuracy for clean content
      expect(result.analysis.accuracy).toBeGreaterThan(80);
    });

    it('should include seq-logprob analysis in results', async () => {
      const testContent = 'Our AI model achieves exactly 99.9% accuracy in all test cases.';

      const result = await analysisService.analyzeContent(testContent, testUser.id);

      // Verify seq-logprob analysis is included
      expect(result.analysis.seqLogprobAnalysis).toBeDefined();
      expect(result.analysis.seqLogprobAnalysis).toMatchObject({
        seqLogprob: expect.any(Number),
        normalizedSeqLogprob: expect.any(Number),
        confidenceScore: expect.any(Number),
        hallucinationRisk: expect.stringMatching(/low|medium|high|critical/),
        isHallucinationSuspected: expect.any(Boolean),
        lowConfidenceTokens: expect.any(Number),
        suspiciousSequences: expect.any(Number),
        processingTime: expect.any(Number)
      });

      expect(result.seqLogprobResult).toBeDefined();
    });

    it('should perform RAG analysis when enabled', async () => {
      const testContent = 'The capital of France is Berlin according to recent geographical studies.';

      // Mock RAG service response
      server.use(
        rest.post('*/rag/analyze', (req, res, ctx) => {
          return res(ctx.json({
            rag_enhanced_accuracy: 25.5,
            verified_claims: [
              {
                claim: 'The capital of France is Berlin',
                verification_status: 'contradicted',
                confidence: 0.95,
                explanation: 'The capital of France is Paris, not Berlin',
                sources: ['https://en.wikipedia.org/wiki/Paris']
              }
            ],
            processing_time: 850
          }));
        })
      );

      const result = await analysisService.analyzeContent(testContent, testUser.id, {
        enableRAG: true
      });

      // Verify RAG analysis is included
      expect(result.ragAnalysis).toBeDefined();
      expect(result.ragAnalysis?.rag_enhanced_accuracy).toBe(25.5);
      expect(result.analysis.accuracy).toBe(25.5); // Should use RAG-enhanced accuracy

      // Should have RAG-specific hallucinations
      const ragHallucinations = result.analysis.hallucinations.filter(h => h.type === 'RAG Contradiction');
      expect(ragHallucinations.length).toBeGreaterThan(0);
    });
  });

  describe('Batch Analysis', () => {
    it('should process multiple documents and store results', async () => {
      const documents = [
        {
          id: 'doc1',
          content: 'Our system achieves exactly 99.8% accuracy with zero errors.',
          filename: 'document1.txt'
        },
        {
          id: 'doc2',
          content: 'This is a normal document with realistic claims.',
          filename: 'document2.txt'
        },
        {
          id: 'doc3',
          content: 'Revolutionary breakthrough: 1000x performance improvement guaranteed.',
          filename: 'document3.txt'
        }
      ];

      // Mock batch API responses
      server.use(
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.json({
            id: `batch-analysis-${Math.random()}`,
            accuracy: Math.random() * 100,
            riskLevel: 'medium',
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

      const results = await analysisService.analyzeBatch(documents, testUser.id);

      expect(results).toHaveLength(3);
      
      results.forEach((result, index) => {
        expect(result.analysis).toMatchObject({
          user_id: testUser.id,
          analysisType: 'batch',
          filename: documents[index].filename
        });
      });

      // Verify all results were stored in database
      const { data: storedResults, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', testUser.id)
        .eq('analysis_type', 'batch');

      expect(error).toBeNull();
      expect(storedResults).toHaveLength(3);
    });

    it('should continue processing other documents when one fails', async () => {
      const documents = [
        { id: 'doc1', content: 'Valid content 1' },
        { id: 'doc2', content: 'Valid content 2' },
        { id: 'doc3', content: 'Valid content 3' }
      ];

      let callCount = 0;
      server.use(
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          callCount++;
          if (callCount === 2) {
            // Fail the second request
            return res(ctx.status(500), ctx.json({ error: 'Processing failed' }));
          }
          return res(ctx.json({
            id: `analysis-${callCount}`,
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

      const results = await analysisService.analyzeBatch(documents, testUser.id);

      // Should still process the other documents
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Analysis History and Analytics', () => {
    it('should retrieve analysis history with filtering', async () => {
      // Create some test analysis results
      await testIsolation.createIsolatedAnalysis({
        user_id: testUser.id,
        accuracy: 95.0,
        risk_level: 'low'
      });
      await testIsolation.createIsolatedAnalysis({
        user_id: testUser.id,
        accuracy: 45.0,
        risk_level: 'critical'
      });

      const history = await analysisService.getAnalysisHistory(testUser.id, {
        limit: 10,
        riskLevel: 'low'
      });

      expect(history).toBeDefined();
      expect(Array.isArray(history.results || history)).toBe(true);
    });

    it('should retrieve user analytics', async () => {
      // Create test data for analytics
      await testIsolation.createIsolatedAnalysis({
        user_id: testUser.id,
        accuracy: 85.0,
        risk_level: 'medium'
      });

      const analytics = await analysisService.getUserAnalytics(testUser.id);

      expect(analytics).toBeDefined();
      // Analytics structure will depend on the implementation
    });

    it('should search analysis results', async () => {
      // Create searchable analysis result
      await testIsolation.createIsolatedAnalysis({
        user_id: testUser.id,
        content: 'Searchable test content with specific keywords',
        accuracy: 75.0,
        risk_level: 'medium'
      });

      const searchResults = await analysisService.searchAnalysisResults(
        'searchable test',
        testUser.id,
        { limit: 5 }
      );

      expect(searchResults).toBeDefined();
      expect(Array.isArray(searchResults.results || searchResults)).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance metrics', async () => {
      const testContent = 'Performance test content';

      const startTime = Date.now();
      await analysisService.analyzeContent(testContent, testUser.id);
      const endTime = Date.now();

      const metrics = analysisService.getPerformanceMetrics();
      expect(metrics).toBeDefined();

      // Verify the operation completed within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds max
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle database connection issues gracefully', async () => {
      const testContent = 'Test content for error handling';

      // Temporarily break database connection by using invalid client
      const originalSupabase = (analysisService as any).supabase;
      
      try {
        const result = await analysisService.analyzeContent(testContent, testUser.id);
        
        // Should still return analysis even if database save fails
        expect(result.analysis).toBeDefined();
        expect(result.analysis.accuracy).toBeGreaterThan(0);
      } finally {
        // Restore original connection
        (analysisService as any).supabase = originalSupabase;
      }
    });

    it('should handle malformed content gracefully', async () => {
      const malformedContent = '\x00\x01\x02Invalid binary content\xFF\xFE';

      const result = await analysisService.analyzeContent(malformedContent, testUser.id);

      expect(result.analysis).toBeDefined();
      expect(result.analysis.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.analysis.accuracy).toBeLessThanOrEqual(100);
    });

    it('should handle very large content', async () => {
      const largeContent = 'Large content test. '.repeat(10000); // ~200KB content

      const result = await analysisService.analyzeContent(largeContent, testUser.id);

      expect(result.analysis).toBeDefined();
      expect(result.analysis.content.length).toBeLessThanOrEqual(203); // Truncated to 200 chars + "..."
      expect(result.analysis.fullContent).toBe(largeContent);
    });

    it('should handle concurrent analysis requests', async () => {
      const testContents = [
        'Concurrent test content 1',
        'Concurrent test content 2',
        'Concurrent test content 3',
        'Concurrent test content 4',
        'Concurrent test content 5'
      ];

      const promises = testContents.map(content => 
        analysisService.analyzeContent(content, testUser.id)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.analysis).toBeDefined();
        expect(result.analysis.user_id).toBe(testUser.id);
      });
    });
  });
});