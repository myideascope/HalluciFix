import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import analysisService from '../analysisService';
import { createApiClient } from '../api';
import ragService from '../ragService';
import { SeqLogprobAnalyzer } from '../seqLogprob';

// Mock dependencies
vi.mock('../api');
vi.mock('../ragService');
vi.mock('../seqLogprob');
vi.mock('../tokenizer');

const mockApiClient = {
  analyzeContent: vi.fn()
};

const mockRagService = {
  performRAGAnalysis: vi.fn()
};

const mockSeqLogprobAnalyzer = {
  detectHallucination: vi.fn()
};

const mockTokenizer = {
  tokenize: vi.fn()
};

describe('AnalysisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createApiClient).mockReturnValue(mockApiClient as any);
    vi.mocked(ragService.performRAGAnalysis).mockImplementation(mockRagService.performRAGAnalysis);
    vi.mocked(SeqLogprobAnalyzer).mockImplementation(() => mockSeqLogprobAnalyzer as any);
    
    // Mock tokenizer
    const { SimpleTokenizer } = require('../tokenizer');
    vi.mocked(SimpleTokenizer.tokenize).mockReturnValue({
      tokens: ['test', 'tokens'],
      probabilities: [0.8, 0.9]
    });
    
    // Mock seq-logprob analyzer
    mockSeqLogprobAnalyzer.detectHallucination.mockReturnValue({
      seqLogprob: -2.0,
      normalizedSeqLogprob: -0.5,
      confidenceScore: 75,
      hallucinationRisk: 'medium',
      isHallucinationSuspected: false,
      lowConfidenceTokens: [],
      suspiciousSequences: [],
      processingTime: 100
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('analyzeContent', () => {
    const mockUserId = 'test-user-123';
    const mockContent = 'This AI system achieves exactly 99.7% accuracy with zero false positives.';

    it('should perform standard analysis with API client', async () => {
      const mockApiResponse = {
        id: 'analysis-123',
        accuracy: 75.5,
        riskLevel: 'medium' as const,
        hallucinations: [
          {
            text: 'exactly 99.7%',
            type: 'False Precision',
            confidence: 0.85,
            explanation: 'Suspiciously specific statistic',
            startIndex: 25,
            endIndex: 38
          }
        ],
        verificationSources: 8,
        processingTime: 1250,
        metadata: {
          timestamp: '2024-01-01T00:00:00Z'
        }
      };

      mockApiClient.analyzeContent.mockResolvedValue(mockApiResponse);
      mockRagService.performRAGAnalysis.mockResolvedValue({
        rag_enhanced_accuracy: 78.2,
        verified_claims: []
      });

      const result = await analysisService.analyzeContent(mockContent, mockUserId);

      expect(mockApiClient.analyzeContent).toHaveBeenCalledWith({
        content: mockContent,
        options: {
          sensitivity: 'medium',
          includeSourceVerification: true,
          maxHallucinations: 5
        }
      });

      expect(result.analysis).toMatchObject({
        id: 'analysis-123',
        user_id: mockUserId,
        accuracy: 78.2, // Should be updated by RAG analysis
        riskLevel: 'medium',
        hallucinations: expect.any(Array),
        verificationSources: 8,
        processingTime: 1250,
        analysisType: 'single'
      });
    });

    it('should handle API client errors and fall back to mock analysis', async () => {
      // Force no API client by mocking createApiClient to return null
      vi.mocked(createApiClient).mockReturnValue(null as any);
      mockRagService.performRAGAnalysis.mockResolvedValue({
        rag_enhanced_accuracy: 82.1,
        verified_claims: []
      });

      const result = await analysisService.analyzeContent(mockContent, mockUserId);

      expect(result.analysis).toMatchObject({
        user_id: mockUserId,
        accuracy: expect.any(Number),
        riskLevel: expect.stringMatching(/low|medium|high|critical/),
        hallucinations: expect.any(Array),
        analysisType: 'single'
      });

      expect(result.analysis.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.analysis.accuracy).toBeLessThanOrEqual(100);
    });

    it('should detect suspicious patterns in mock analysis', async () => {
      // Force mock analysis by not setting up API client
      vi.mocked(createApiClient).mockReturnValue(null as any);
      
      const suspiciousContent = 'Our system has exactly 99.7% accuracy with zero complaints and unprecedented results.';
      
      mockRagService.performRAGAnalysis.mockResolvedValue({
        rag_enhanced_accuracy: 65.3,
        verified_claims: []
      });

      const result = await analysisService.analyzeContent(suspiciousContent, mockUserId);

      expect(result.analysis.hallucinations.length).toBeGreaterThan(0);
      expect(result.analysis.hallucinations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: expect.stringMatching(/False Precision|Unverifiable Claim|Exaggerated Language/)
          })
        ])
      );
    });

    it('should apply custom options correctly', async () => {
      const options = {
        sensitivity: 'high' as const,
        includeSourceVerification: false,
        maxHallucinations: 10,
        enableRAG: false
      };

      mockApiClient.analyzeContent.mockResolvedValue({
        id: 'analysis-456',
        accuracy: 88.0,
        riskLevel: 'low' as const,
        hallucinations: [],
        verificationSources: 12,
        processingTime: 800,
        metadata: { timestamp: '2024-01-01T00:00:00Z' }
      });

      const result = await analysisService.analyzeContent(mockContent, mockUserId, options);

      expect(mockApiClient.analyzeContent).toHaveBeenCalledWith({
        content: mockContent,
        options: {
          sensitivity: 'high',
          includeSourceVerification: false,
          maxHallucinations: 10
        }
      });

      expect(mockRagService.performRAGAnalysis).not.toHaveBeenCalled();
    });

    it('should integrate seq-logprob analysis results', async () => {
      mockApiClient.analyzeContent.mockResolvedValue({
        id: 'analysis-789',
        accuracy: 85.0,
        riskLevel: 'low' as const,
        hallucinations: [],
        verificationSources: 10,
        processingTime: 900,
        metadata: { timestamp: '2024-01-01T00:00:00Z' }
      });

      mockSeqLogprobAnalyzer.detectHallucination.mockReturnValue({
        seqLogprob: -3.2,
        normalizedSeqLogprob: -0.8,
        confidenceScore: 0.45,
        hallucinationRisk: 'high',
        isHallucinationSuspected: true,
        lowConfidenceTokens: ['exactly', '99.7%'],
        suspiciousSequences: [{ tokens: ['exactly', '99.7%'], avgLogprob: -4.1 }],
        processingTime: 150
      });

      mockRagService.performRAGAnalysis.mockResolvedValue({
        rag_enhanced_accuracy: 82.0,
        verified_claims: []
      });

      const result = await analysisService.analyzeContent(mockContent, mockUserId);

      expect(result.analysis.seqLogprobAnalysis).toMatchObject({
        seqLogprob: -3.2,
        hallucinationRisk: 'high',
        isHallucinationSuspected: true,
        lowConfidenceTokens: ['exactly', '99.7%']
      });

      // Should adjust accuracy based on seq-logprob results
      expect(result.analysis.accuracy).toBeLessThanOrEqual(75);
    });
  });

  describe('analyzeBatch', () => {
    it('should analyze multiple documents', async () => {
      const documents = [
        { id: 'doc1', content: 'First document content', filename: 'doc1.txt' },
        { id: 'doc2', content: 'Second document content', filename: 'doc2.txt' }
      ];

      mockApiClient.analyzeContent.mockResolvedValue({
        id: 'batch-analysis',
        accuracy: 80.0,
        riskLevel: 'medium' as const,
        hallucinations: [],
        verificationSources: 5,
        processingTime: 600,
        metadata: { timestamp: '2024-01-01T00:00:00Z' }
      });

      mockRagService.performRAGAnalysis.mockResolvedValue({
        rag_enhanced_accuracy: 82.0,
        verified_claims: []
      });

      const results = await analysisService.analyzeBatch(documents, 'test-user');

      expect(results).toHaveLength(2);
      results.forEach((result, index) => {
        expect(result.analysis.analysisType).toBe('batch');
        expect(result.analysis.filename).toBe(documents[index].filename);
      });
    });

    it('should continue processing other documents if one fails', async () => {
      const documents = [
        { id: 'doc1', content: 'First document' },
        { id: 'doc2', content: 'Second document' },
        { id: 'doc3', content: 'Third document' }
      ];

      // Force mock analysis for this test
      vi.mocked(createApiClient).mockReturnValue(null as any);

      // Mock RAG to fail for the second document only
      mockRagService.performRAGAnalysis
        .mockResolvedValueOnce({
          rag_enhanced_accuracy: 80.0,
          verified_claims: []
        })
        .mockRejectedValueOnce(new Error('RAG failed'))
        .mockResolvedValueOnce({
          rag_enhanced_accuracy: 75.0,
          verified_claims: []
        });

      const results = await analysisService.analyzeBatch(documents, 'test-user');

      // Should have 3 results (all documents processed, even with RAG failure)
      expect(results).toHaveLength(3);
    });
  });

  describe('RAG integration', () => {
    it('should enhance analysis with RAG results', async () => {
      mockApiClient.analyzeContent.mockResolvedValue({
        id: 'analysis-rag',
        accuracy: 70.0,
        riskLevel: 'medium' as const,
        hallucinations: [],
        verificationSources: 5,
        processingTime: 800,
        metadata: { timestamp: '2024-01-01T00:00:00Z' }
      });

      mockRagService.performRAGAnalysis.mockResolvedValue({
        rag_enhanced_accuracy: 85.5,
        verified_claims: [
          {
            claim: 'exactly 99.7% accuracy',
            verification_status: 'contradicted',
            confidence: 0.9,
            explanation: 'No reliable sources support this specific accuracy claim'
          }
        ]
      });

      const result = await analysisService.analyzeContent(mockContent, 'test-user');

      expect(result.analysis.accuracy).toBe(85.5);
      expect(result.analysis.ragAnalysis).toBeDefined();
      expect(result.analysis.hallucinations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'RAG Contradiction',
            text: 'exactly 99.7% accuracy'
          })
        ])
      );
    });

    it('should handle RAG analysis failures gracefully', async () => {
      mockApiClient.analyzeContent.mockResolvedValue({
        id: 'analysis-rag-fail',
        accuracy: 75.0,
        riskLevel: 'medium' as const,
        hallucinations: [],
        verificationSources: 6,
        processingTime: 600,
        metadata: { timestamp: '2024-01-01T00:00:00Z' }
      });

      mockRagService.performRAGAnalysis.mockRejectedValue(new Error('RAG service unavailable'));

      const result = await analysisService.analyzeContent(mockContent, 'test-user');

      expect(result.analysis.accuracy).toBe(75.0); // Should use original accuracy
      expect(result.ragAnalysis).toBeUndefined();
    });
  });
});