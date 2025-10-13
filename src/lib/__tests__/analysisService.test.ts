import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import analysisService from '../analysisService';
import { createApiClient } from '../api';
import ragService from '../ragService';
import { SeqLogprobAnalyzer } from '../seqLogprob';

// Mock dependencies
vi.mock('../api');
vi.mock('../ragService');
vi.mock('../seqLogprob');
<<<<<<< HEAD
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
=======

const mockCreateApiClient = vi.mocked(createApiClient);
const mockRagService = vi.mocked(ragService);
const mockSeqLogprobAnalyzer = vi.mocked(SeqLogprobAnalyzer);

describe('AnalysisService', () => {
  const mockApiClient = {
    analyzeContent: vi.fn()
  };

  const mockSeqLogprobInstance = {
    detectHallucination: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock environment variable
    vi.stubEnv('VITE_HALLUCIFIX_API_KEY', 'test-api-key');
    
    // Setup API client mock
    mockCreateApiClient.mockReturnValue(mockApiClient as any);
    
    // Setup SeqLogprob analyzer mock
    mockSeqLogprobAnalyzer.mockImplementation(() => mockSeqLogprobInstance as any);
    
    // Setup RAG service mock
    mockRagService.performRAGAnalysis = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('analyzeContent', () => {
    const testUserId = 'test-user-123';
    const testContent = 'This AI system achieves exactly 99.7% accuracy with zero false positives.';

    it('should perform standard analysis with API client when API key is available', async () => {
      const mockApiResponse = {
        id: 'analysis-123',
        accuracy: 85.5,
        riskLevel: 'medium' as const,
        hallucinations: [
          {
            text: 'exactly 99.7% accuracy',
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
            type: 'False Precision',
            confidence: 0.85,
            explanation: 'Suspiciously specific statistic',
            startIndex: 25,
<<<<<<< HEAD
            endIndex: 38
=======
            endIndex: 45
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          }
        ],
        verificationSources: 8,
        processingTime: 1250,
        metadata: {
<<<<<<< HEAD
          timestamp: '2024-01-01T00:00:00Z'
=======
          timestamp: '2024-01-01T00:00:00Z',
          contentLength: testContent.length,
          modelVersion: '1.0.0'
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        }
      };

      mockApiClient.analyzeContent.mockResolvedValue(mockApiResponse);
<<<<<<< HEAD
      mockRagService.performRAGAnalysis.mockResolvedValue({
        rag_enhanced_accuracy: 78.2,
        verified_claims: []
      });

      const result = await analysisService.analyzeContent(mockContent, mockUserId);

      expect(mockApiClient.analyzeContent).toHaveBeenCalledWith({
        content: mockContent,
=======
      
      // Mock seq-logprob analysis
      mockSeqLogprobInstance.detectHallucination.mockReturnValue({
        seqLogprob: -3.2,
        normalizedSeqLogprob: -0.8,
        confidenceScore: 0.75,
        hallucinationRisk: 'medium',
        isHallucinationSuspected: true,
        lowConfidenceTokens: ['exactly', '99.7%'],
        suspiciousSequences: [{ tokens: ['exactly', '99.7%'], avgLogprob: -4.1 }],
        processingTime: 150
      });

      // Mock RAG analysis
      const mockRagAnalysis = {
        rag_enhanced_accuracy: 82.3,
        verified_claims: [
          {
            claim: 'exactly 99.7% accuracy',
            verification_status: 'contradicted' as const,
            confidence: 0.90,
            explanation: 'This precision level is unrealistic for AI systems'
          }
        ],
        processing_time: 2100,
        sources_consulted: 12
      };
      mockRagService.performRAGAnalysis.mockResolvedValue(mockRagAnalysis);

      const result = await analysisService.analyzeContent(testContent, testUserId);

      expect(mockApiClient.analyzeContent).toHaveBeenCalledWith({
        content: testContent,
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        options: {
          sensitivity: 'medium',
          includeSourceVerification: true,
          maxHallucinations: 5
        }
      });

      expect(result.analysis).toMatchObject({
        id: 'analysis-123',
<<<<<<< HEAD
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
=======
        user_id: testUserId,
        content: expect.stringContaining('This AI system achieves'),
        accuracy: 82.3, // Should be updated by RAG analysis
        riskLevel: 'medium',
        hallucinations: expect.arrayContaining([
          expect.objectContaining({
            text: 'exactly 99.7% accuracy',
            type: 'False Precision'
          })
        ]),
        analysisType: 'single'
      });

      expect(result.analysis.seqLogprobAnalysis).toBeDefined();
      expect(result.analysis.ragAnalysis).toBeDefined();
      expect(result.ragAnalysis).toEqual(mockRagAnalysis);
    });

    it('should fall back to mock analysis when API client fails', async () => {
      mockApiClient.analyzeContent.mockRejectedValue(new Error('API Error'));
      
      // Mock seq-logprob analysis
      mockSeqLogprobInstance.detectHallucination.mockReturnValue({
        seqLogprob: -2.1,
        normalizedSeqLogprob: -0.5,
        confidenceScore: 0.85,
        hallucinationRisk: 'low',
        isHallucinationSuspected: false,
        lowConfidenceTokens: [],
        suspiciousSequences: [],
        processingTime: 100
      });

      const result = await analysisService.analyzeContent(testContent, testUserId);

      expect(result.analysis).toMatchObject({
        user_id: testUserId,
        content: expect.stringContaining('This AI system achieves'),
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        accuracy: expect.any(Number),
        riskLevel: expect.stringMatching(/low|medium|high|critical/),
        hallucinations: expect.any(Array),
        analysisType: 'single'
      });

<<<<<<< HEAD
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
=======
      // Should still have seq-logprob analysis even when API fails
      expect(result.analysis.seqLogprobAnalysis).toBeDefined();
    });

    it('should use mock analysis when no API key is provided', async () => {
      vi.stubEnv('VITE_HALLUCIFIX_API_KEY', '');
      
      // Create new instance without API key
      const { default: analysisServiceNoKey } = await import('../analysisService');
      
      const result = await analysisServiceNoKey.analyzeContent(testContent, testUserId);

      expect(mockApiClient.analyzeContent).not.toHaveBeenCalled();
      expect(result.analysis).toMatchObject({
        user_id: testUserId,
        analysisType: 'single',
        accuracy: expect.any(Number),
        riskLevel: expect.stringMatching(/low|medium|high|critical/)
      });
    });

    it('should handle different sensitivity options', async () => {
      const mockApiResponse = {
        id: 'analysis-456',
        accuracy: 92.1,
        riskLevel: 'low' as const,
        hallucinations: [],
        verificationSources: 15,
        processingTime: 800,
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          contentLength: testContent.length,
          modelVersion: '1.0.0'
        }
      };

      mockApiClient.analyzeContent.mockResolvedValue(mockApiResponse);
      mockSeqLogprobInstance.detectHallucination.mockReturnValue({
        seqLogprob: -1.8,
        normalizedSeqLogprob: -0.3,
        confidenceScore: 0.95,
        hallucinationRisk: 'low',
        isHallucinationSuspected: false,
        lowConfidenceTokens: [],
        suspiciousSequences: [],
        processingTime: 80
      });

      await analysisService.analyzeContent(testContent, testUserId, {
        sensitivity: 'high',
        includeSourceVerification: false,
        maxHallucinations: 10
      });

      expect(mockApiClient.analyzeContent).toHaveBeenCalledWith({
        content: testContent,
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        options: {
          sensitivity: 'high',
          includeSourceVerification: false,
          maxHallucinations: 10
        }
      });
<<<<<<< HEAD

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
=======
    });

    it('should adjust accuracy based on seq-logprob results', async () => {
      const mockApiResponse = {
        id: 'analysis-789',
        accuracy: 90.0,
        riskLevel: 'low' as const,
        hallucinations: [],
        verificationSources: 10,
        processingTime: 1000,
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          contentLength: testContent.length,
          modelVersion: '1.0.0'
        }
      };

      mockApiClient.analyzeContent.mockResolvedValue(mockApiResponse);
      
      // Mock critical seq-logprob result
      mockSeqLogprobInstance.detectHallucination.mockReturnValue({
        seqLogprob: -5.2,
        normalizedSeqLogprob: -1.5,
        confidenceScore: 0.25,
        hallucinationRisk: 'critical',
        isHallucinationSuspected: true,
        lowConfidenceTokens: ['exactly', '99.7%', 'zero'],
        suspiciousSequences: [
          { tokens: ['exactly', '99.7%'], avgLogprob: -6.1 },
          { tokens: ['zero', 'false', 'positives'], avgLogprob: -5.8 }
        ],
        processingTime: 200
      });

      const result = await analysisService.analyzeContent(testContent, testUserId);

      // Accuracy should be reduced due to critical seq-logprob result
      expect(result.analysis.accuracy).toBeLessThanOrEqual(60);
      expect(result.analysis.riskLevel).toBe('critical');
    });

    it('should handle RAG analysis errors gracefully', async () => {
      const mockApiResponse = {
        id: 'analysis-error',
        accuracy: 85.0,
        riskLevel: 'medium' as const,
        hallucinations: [],
        verificationSources: 8,
        processingTime: 1200,
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          contentLength: testContent.length,
          modelVersion: '1.0.0'
        }
      };

      mockApiClient.analyzeContent.mockResolvedValue(mockApiResponse);
      mockSeqLogprobInstance.detectHallucination.mockReturnValue({
        seqLogprob: -2.5,
        normalizedSeqLogprob: -0.6,
        confidenceScore: 0.80,
        hallucinationRisk: 'medium',
        isHallucinationSuspected: false,
        lowConfidenceTokens: [],
        suspiciousSequences: [],
        processingTime: 120
      });

      // Mock RAG service error
      mockRagService.performRAGAnalysis.mockRejectedValue(new Error('RAG service unavailable'));

      const result = await analysisService.analyzeContent(testContent, testUserId);

      // Should continue with standard analysis even if RAG fails
      expect(result.analysis).toBeDefined();
      expect(result.ragAnalysis).toBeUndefined();
      expect(result.analysis.accuracy).toBe(85.0); // Should keep original accuracy
    });

    it('should disable RAG analysis when enableRAG is false', async () => {
      const mockApiResponse = {
        id: 'analysis-no-rag',
        accuracy: 88.5,
        riskLevel: 'low' as const,
        hallucinations: [],
        verificationSources: 12,
        processingTime: 900,
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          contentLength: testContent.length,
          modelVersion: '1.0.0'
        }
      };

      mockApiClient.analyzeContent.mockResolvedValue(mockApiResponse);
      mockSeqLogprobInstance.detectHallucination.mockReturnValue({
        seqLogprob: -2.0,
        normalizedSeqLogprob: -0.4,
        confidenceScore: 0.90,
        hallucinationRisk: 'low',
        isHallucinationSuspected: false,
        lowConfidenceTokens: [],
        suspiciousSequences: [],
        processingTime: 90
      });

      const result = await analysisService.analyzeContent(testContent, testUserId, {
        enableRAG: false
      });

      expect(mockRagService.performRAGAnalysis).not.toHaveBeenCalled();
      expect(result.ragAnalysis).toBeUndefined();
      expect(result.analysis.ragAnalysis).toBeUndefined();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('analyzeBatch', () => {
<<<<<<< HEAD
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
=======
    const testUserId = 'test-user-batch';
    const testDocuments = [
      { id: 'doc1', content: 'First document content', filename: 'doc1.txt' },
      { id: 'doc2', content: 'Second document content', filename: 'doc2.txt' },
      { id: 'doc3', content: 'Third document content', filename: 'doc3.txt' }
    ];

    it('should analyze multiple documents and return batch results', async () => {
      const mockApiResponse = {
        id: 'batch-analysis',
        accuracy: 87.2,
        riskLevel: 'low' as const,
        hallucinations: [],
        verificationSources: 10,
        processingTime: 1100,
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          contentLength: 100,
          modelVersion: '1.0.0'
        }
      };

      mockApiClient.analyzeContent.mockResolvedValue(mockApiResponse);
      mockSeqLogprobInstance.detectHallucination.mockReturnValue({
        seqLogprob: -2.2,
        normalizedSeqLogprob: -0.5,
        confidenceScore: 0.85,
        hallucinationRisk: 'low',
        isHallucinationSuspected: false,
        lowConfidenceTokens: [],
        suspiciousSequences: [],
        processingTime: 100
      });

      const results = await analysisService.analyzeBatch(testDocuments, testUserId);

      expect(results).toHaveLength(3);
      
      results.forEach((result, index) => {
        expect(result.analysis).toMatchObject({
          user_id: testUserId,
          analysisType: 'batch',
          filename: testDocuments[index].filename
        });
      });

      expect(mockApiClient.analyzeContent).toHaveBeenCalledTimes(3);
    });

    it('should continue processing other documents when one fails', async () => {
      mockApiClient.analyzeContent
        .mockResolvedValueOnce({
          id: 'success-1',
          accuracy: 85.0,
          riskLevel: 'medium' as const,
          hallucinations: [],
          verificationSources: 8,
          processingTime: 1000,
          metadata: { timestamp: '2024-01-01T00:00:00Z', contentLength: 100, modelVersion: '1.0.0' }
        })
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockResolvedValueOnce({
          id: 'success-3',
          accuracy: 92.1,
          riskLevel: 'low' as const,
          hallucinations: [],
          verificationSources: 12,
          processingTime: 800,
          metadata: { timestamp: '2024-01-01T00:00:00Z', contentLength: 100, modelVersion: '1.0.0' }
        });

      mockSeqLogprobInstance.detectHallucination.mockReturnValue({
        seqLogprob: -2.0,
        normalizedSeqLogprob: -0.4,
        confidenceScore: 0.90,
        hallucinationRisk: 'low',
        isHallucinationSuspected: false,
        lowConfidenceTokens: [],
        suspiciousSequences: [],
        processingTime: 80
      });

      const results = await analysisService.analyzeBatch(testDocuments, testUserId);

      // Should have 2 successful results (first and third documents)
      expect(results).toHaveLength(2);
      expect(results[0].analysis.filename).toBe('doc1.txt');
      expect(results[1].analysis.filename).toBe('doc3.txt');
    });

    it('should pass batch options to individual analyses', async () => {
      const mockApiResponse = {
        id: 'batch-with-options',
        accuracy: 90.5,
        riskLevel: 'low' as const,
        hallucinations: [],
        verificationSources: 15,
        processingTime: 700,
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          contentLength: 100,
          modelVersion: '1.0.0'
        }
      };

      mockApiClient.analyzeContent.mockResolvedValue(mockApiResponse);
      mockSeqLogprobInstance.detectHallucination.mockReturnValue({
        seqLogprob: -1.8,
        normalizedSeqLogprob: -0.3,
        confidenceScore: 0.95,
        hallucinationRisk: 'low',
        isHallucinationSuspected: false,
        lowConfidenceTokens: [],
        suspiciousSequences: [],
        processingTime: 70
      });

      const batchOptions = {
        sensitivity: 'high' as const,
        includeSourceVerification: false,
        maxHallucinations: 8,
        enableRAG: false
      };

      await analysisService.analyzeBatch(testDocuments, testUserId, batchOptions);

      // Verify that each call received the batch options
      expect(mockApiClient.analyzeContent).toHaveBeenCalledTimes(3);
      testDocuments.forEach((doc, index) => {
        expect(mockApiClient.analyzeContent).toHaveBeenNthCalledWith(index + 1, {
          content: doc.content,
          options: {
            sensitivity: 'high',
            includeSourceVerification: false,
            maxHallucinations: 8
          }
        });
      });

      // RAG should not be called when disabled
      expect(mockRagService.performRAGAnalysis).not.toHaveBeenCalled();
    });
  });

  describe('mock analysis patterns', () => {
    beforeEach(() => {
      // Test without API key to force mock analysis
      vi.stubEnv('VITE_HALLUCIFIX_API_KEY', '');
    });

    it('should detect false precision patterns', async () => {
      const contentWithPrecision = 'Our system achieves exactly 97.3% accuracy in all cases.';
      
      const { default: mockAnalysisService } = await import('../analysisService');
      const result = await mockAnalysisService.analyzeContent(contentWithPrecision, 'test-user');

      expect(result.analysis.hallucinations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'False Precision',
            text: expect.stringMatching(/exactly \d+\.\d+%/)
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          })
        ])
      );
    });

<<<<<<< HEAD
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
=======
    it('should detect impossible metrics', async () => {
      const contentWithImpossible = 'We guarantee perfect 100% satisfaction with zero complaints.';
      
      const { default: mockAnalysisService } = await import('../analysisService');
      const result = await mockAnalysisService.analyzeContent(contentWithImpossible, 'test-user');

      expect(result.analysis.hallucinations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'Impossible Metric'
          })
        ])
      );
    });

    it('should detect unverifiable attributions', async () => {
      const contentWithAttribution = 'According to recent studies, our approach is revolutionary.';
      
      const { default: mockAnalysisService } = await import('../analysisService');
      const result = await mockAnalysisService.analyzeContent(contentWithAttribution, 'test-user');

      expect(result.analysis.hallucinations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'Unverifiable Attribution'
          })
        ])
      );
    });

    it('should adjust accuracy based on detected patterns', async () => {
      const highRiskContent = `
        Our revolutionary system achieves exactly 99.9% accuracy with zero false positives.
        According to recent studies, this represents unprecedented performance.
        All users report perfect satisfaction with our solution.
      `;
      
      const { default: mockAnalysisService } = await import('../analysisService');
      const result = await mockAnalysisService.analyzeContent(highRiskContent, 'test-user');

      // Should have low accuracy due to multiple suspicious patterns
      expect(result.analysis.accuracy).toBeLessThan(70);
      expect(result.analysis.riskLevel).toMatch(/high|critical/);
      expect(result.analysis.hallucinations.length).toBeGreaterThan(2);
    });

    it('should provide appropriate explanations for detected hallucinations', async () => {
      const contentWithExaggeration = 'This breakthrough is 1000 times faster than competitors.';
      
      const { default: mockAnalysisService } = await import('../analysisService');
      const result = await mockAnalysisService.analyzeContent(contentWithExaggeration, 'test-user');

      const performanceHallucination = result.analysis.hallucinations.find(h => 
        h.type === 'Performance Exaggeration'
      );

      expect(performanceHallucination).toBeDefined();
      expect(performanceHallucination?.explanation).toContain('unrealistically high');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });
});