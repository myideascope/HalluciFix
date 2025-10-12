import { describe, it, expect } from 'vitest';
import { 
  convertDatabaseResult, 
  convertToDatabase, 
  AnalysisResult, 
  DatabaseAnalysisResult 
} from '../analysis';

describe('Analysis Type Converters', () => {
  const mockAnalysisResult: AnalysisResult = {
    id: 'analysis-123',
    user_id: 'user-456',
    content: 'Test content with exactly 99.7% accuracy',
    timestamp: '2024-01-01T10:00:00Z',
    accuracy: 75.5,
    riskLevel: 'medium',
    hallucinations: [
      {
        text: 'exactly 99.7%',
        type: 'False Precision',
        confidence: 0.85,
        explanation: 'Suspiciously specific statistic without verifiable source',
        startIndex: 18,
        endIndex: 31
      },
      {
        text: 'unprecedented results',
        type: 'Exaggerated Language',
        confidence: 0.9,
        explanation: 'Language suggests potential exaggeration',
        startIndex: 50,
        endIndex: 71
      }
    ],
    verificationSources: 8,
    processingTime: 1250,
    analysisType: 'single',
    batchId: 'batch-789',
    scanId: 'scan-101',
    filename: 'test-document.txt',
    fullContent: 'Test content with exactly 99.7% accuracy and unprecedented results',
    seqLogprobAnalysis: {
      seqLogprob: -3.2,
      normalizedSeqLogprob: -0.8,
      confidenceScore: 45,
      hallucinationRisk: 'high',
      isHallucinationSuspected: true,
      lowConfidenceTokens: 3,
      suspiciousSequences: 2,
      processingTime: 150
    }
  };

  const mockDatabaseResult: DatabaseAnalysisResult = {
    id: 'analysis-123',
    user_id: 'user-456',
    content: 'Test content with exactly 99.7% accuracy',
    created_at: '2024-01-01T10:00:00Z',
    accuracy: 75.5,
    risk_level: 'medium',
    hallucinations: [
      {
        text: 'exactly 99.7%',
        type: 'False Precision',
        confidence: 0.85,
        explanation: 'Suspiciously specific statistic without verifiable source',
        startIndex: 18,
        endIndex: 31
      },
      {
        text: 'unprecedented results',
        type: 'Exaggerated Language',
        confidence: 0.9,
        explanation: 'Language suggests potential exaggeration',
        startIndex: 50,
        endIndex: 71
      }
    ],
    verification_sources: 8,
    processing_time: 1250,
    analysis_type: 'single',
    batch_id: 'batch-789',
    scan_id: 'scan-101',
    filename: 'test-document.txt',
    full_content: 'Test content with exactly 99.7% accuracy and unprecedented results',
    seq_logprob_analysis: {
      seqLogprob: -3.2,
      normalizedSeqLogprob: -0.8,
      confidenceScore: 45,
      hallucinationRisk: 'high',
      isHallucinationSuspected: true,
      lowConfidenceTokens: 3,
      suspiciousSequences: 2,
      processingTime: 150
    }
  };

  describe('convertDatabaseResult', () => {
    it('should convert database result to app format correctly', () => {
      const result = convertDatabaseResult(mockDatabaseResult);

      expect(result).toEqual({
        id: 'analysis-123',
        user_id: 'user-456',
        content: 'Test content with exactly 99.7% accuracy',
        timestamp: '2024-01-01T10:00:00Z',
        accuracy: 75.5,
        riskLevel: 'medium',
        hallucinations: mockDatabaseResult.hallucinations,
        verificationSources: 8,
        processingTime: 1250,
        analysisType: 'single',
        batchId: 'batch-789',
        scanId: 'scan-101',
        filename: 'test-document.txt',
        fullContent: 'Test content with exactly 99.7% accuracy and unprecedented results',
        seqLogprobAnalysis: mockDatabaseResult.seq_logprob_analysis
      });
    });

    it('should handle missing optional fields', () => {
      const minimalDbResult: DatabaseAnalysisResult = {
        id: 'analysis-minimal',
        user_id: 'user-123',
        content: 'Minimal content',
        created_at: '2024-01-01T00:00:00Z',
        accuracy: 90.0,
        risk_level: 'low',
        hallucinations: [],
        verification_sources: 5,
        processing_time: 500,
        analysis_type: 'single'
      };

      const result = convertDatabaseResult(minimalDbResult);

      expect(result).toEqual({
        id: 'analysis-minimal',
        user_id: 'user-123',
        content: 'Minimal content',
        timestamp: '2024-01-01T00:00:00Z',
        accuracy: 90.0,
        riskLevel: 'low',
        hallucinations: [],
        verificationSources: 5,
        processingTime: 500,
        analysisType: 'single',
        batchId: undefined,
        scanId: undefined,
        filename: undefined,
        fullContent: undefined,
        seqLogprobAnalysis: undefined
      });
    });

    it('should preserve hallucination array structure', () => {
      const result = convertDatabaseResult(mockDatabaseResult);

      expect(result.hallucinations).toHaveLength(2);
      expect(result.hallucinations[0]).toEqual({
        text: 'exactly 99.7%',
        type: 'False Precision',
        confidence: 0.85,
        explanation: 'Suspiciously specific statistic without verifiable source',
        startIndex: 18,
        endIndex: 31
      });
    });

    it('should handle different risk levels', () => {
      const riskLevels: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];

      riskLevels.forEach(riskLevel => {
        const dbResult = { ...mockDatabaseResult, risk_level: riskLevel };
        const result = convertDatabaseResult(dbResult);
        expect(result.riskLevel).toBe(riskLevel);
      });
    });

    it('should handle different analysis types', () => {
      const analysisTypes: Array<'single' | 'batch' | 'scheduled'> = ['single', 'batch', 'scheduled'];

      analysisTypes.forEach(analysisType => {
        const dbResult = { ...mockDatabaseResult, analysis_type: analysisType };
        const result = convertDatabaseResult(dbResult);
        expect(result.analysisType).toBe(analysisType);
      });
    });

    it('should preserve seq-logprob analysis structure', () => {
      const result = convertDatabaseResult(mockDatabaseResult);

      expect(result.seqLogprobAnalysis).toEqual({
        seqLogprob: -3.2,
        normalizedSeqLogprob: -0.8,
        confidenceScore: 45,
        hallucinationRisk: 'high',
        isHallucinationSuspected: true,
        lowConfidenceTokens: 3,
        suspiciousSequences: 2,
        processingTime: 150
      });
    });
  });

  describe('convertToDatabase', () => {
    it('should convert app result to database format correctly', () => {
      const result = convertToDatabase(mockAnalysisResult);

      expect(result).toEqual({
        user_id: 'user-456',
        content: 'Test content with exactly 99.7% accuracy',
        accuracy: 75.5,
        risk_level: 'medium',
        hallucinations: mockAnalysisResult.hallucinations,
        verification_sources: 8,
        processing_time: 1250,
        analysis_type: 'single',
        batch_id: 'batch-789',
        scan_id: 'scan-101',
        filename: 'test-document.txt',
        full_content: 'Test content with exactly 99.7% accuracy and unprecedented results',
        seq_logprob_analysis: mockAnalysisResult.seqLogprobAnalysis
      });
    });

    it('should exclude id and timestamp fields', () => {
      const result = convertToDatabase(mockAnalysisResult);

      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('created_at');
      expect(result).not.toHaveProperty('timestamp');
    });

    it('should handle missing optional fields', () => {
      const minimalAppResult: AnalysisResult = {
        id: 'analysis-minimal',
        user_id: 'user-123',
        content: 'Minimal content',
        timestamp: '2024-01-01T00:00:00Z',
        accuracy: 90.0,
        riskLevel: 'low',
        hallucinations: [],
        verificationSources: 5,
        processingTime: 500,
        analysisType: 'single'
      };

      const result = convertToDatabase(minimalAppResult);

      expect(result).toEqual({
        user_id: 'user-123',
        content: 'Minimal content',
        accuracy: 90.0,
        risk_level: 'low',
        hallucinations: [],
        verification_sources: 5,
        processing_time: 500,
        analysis_type: 'single',
        batch_id: undefined,
        scan_id: undefined,
        filename: undefined,
        full_content: undefined,
        seq_logprob_analysis: undefined
      });
    });

    it('should preserve hallucination array structure', () => {
      const result = convertToDatabase(mockAnalysisResult);

      expect(result.hallucinations).toHaveLength(2);
      expect(result.hallucinations[0]).toEqual({
        text: 'exactly 99.7%',
        type: 'False Precision',
        confidence: 0.85,
        explanation: 'Suspiciously specific statistic without verifiable source',
        startIndex: 18,
        endIndex: 31
      });
    });

    it('should handle empty hallucinations array', () => {
      const resultWithNoHallucinations = {
        ...mockAnalysisResult,
        hallucinations: []
      };

      const result = convertToDatabase(resultWithNoHallucinations);

      expect(result.hallucinations).toEqual([]);
    });

    it('should handle hallucinations without optional indices', () => {
      const hallucinationWithoutIndices = {
        text: 'test hallucination',
        type: 'Test Type',
        confidence: 0.8,
        explanation: 'Test explanation'
      };

      const resultWithPartialHallucination = {
        ...mockAnalysisResult,
        hallucinations: [hallucinationWithoutIndices]
      };

      const result = convertToDatabase(resultWithPartialHallucination);

      expect(result.hallucinations[0]).toEqual({
        text: 'test hallucination',
        type: 'Test Type',
        confidence: 0.8,
        explanation: 'Test explanation'
      });
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain data integrity through round-trip conversion', () => {
      // Convert app format to database format
      const dbFormat = convertToDatabase(mockAnalysisResult);
      
      // Add the fields that would be added by the database
      const completeDbResult: DatabaseAnalysisResult = {
        id: mockAnalysisResult.id,
        created_at: mockAnalysisResult.timestamp,
        ...dbFormat
      };

      // Convert back to app format
      const backToAppFormat = convertDatabaseResult(completeDbResult);

      // Should match original (excluding any undefined fields)
      expect(backToAppFormat).toEqual(mockAnalysisResult);
    });

    it('should handle round-trip with minimal data', () => {
      const minimalResult: AnalysisResult = {
        id: 'test-id',
        user_id: 'test-user',
        content: 'test content',
        timestamp: '2024-01-01T00:00:00Z',
        accuracy: 85.0,
        riskLevel: 'low',
        hallucinations: [],
        verificationSources: 3,
        processingTime: 200,
        analysisType: 'single'
      };

      const dbFormat = convertToDatabase(minimalResult);
      const completeDbResult: DatabaseAnalysisResult = {
        id: minimalResult.id,
        created_at: minimalResult.timestamp,
        ...dbFormat
      };
      const backToAppFormat = convertDatabaseResult(completeDbResult);

      expect(backToAppFormat).toEqual(minimalResult);
    });
  });

  describe('edge cases', () => {
    it('should handle zero values correctly', () => {
      const zeroValuesResult: AnalysisResult = {
        id: 'zero-test',
        user_id: 'user-zero',
        content: '',
        timestamp: '2024-01-01T00:00:00Z',
        accuracy: 0,
        riskLevel: 'critical',
        hallucinations: [],
        verificationSources: 0,
        processingTime: 0,
        analysisType: 'single'
      };

      const dbFormat = convertToDatabase(zeroValuesResult);
      expect(dbFormat.accuracy).toBe(0);
      expect(dbFormat.verification_sources).toBe(0);
      expect(dbFormat.processing_time).toBe(0);
      expect(dbFormat.content).toBe('');

      const completeDbResult: DatabaseAnalysisResult = {
        id: zeroValuesResult.id,
        created_at: zeroValuesResult.timestamp,
        ...dbFormat
      };
      const backToAppFormat = convertDatabaseResult(completeDbResult);
      expect(backToAppFormat).toEqual(zeroValuesResult);
    });

    it('should handle very large numbers', () => {
      const largeNumbersResult: AnalysisResult = {
        id: 'large-test',
        user_id: 'user-large',
        content: 'x'.repeat(10000),
        timestamp: '2024-01-01T00:00:00Z',
        accuracy: 99.999,
        riskLevel: 'low',
        hallucinations: [],
        verificationSources: 999999,
        processingTime: 999999,
        analysisType: 'batch'
      };

      const dbFormat = convertToDatabase(largeNumbersResult);
      expect(dbFormat.accuracy).toBe(99.999);
      expect(dbFormat.verification_sources).toBe(999999);
      expect(dbFormat.processing_time).toBe(999999);

      const completeDbResult: DatabaseAnalysisResult = {
        id: largeNumbersResult.id,
        created_at: largeNumbersResult.timestamp,
        ...dbFormat
      };
      const backToAppFormat = convertDatabaseResult(completeDbResult);
      expect(backToAppFormat).toEqual(largeNumbersResult);
    });

    it('should handle special characters in text fields', () => {
      const specialCharsResult: AnalysisResult = {
        id: 'special-chars-test',
        user_id: 'user-special',
        content: 'Content with "quotes", \'apostrophes\', and émojis 🚀',
        timestamp: '2024-01-01T00:00:00Z',
        accuracy: 75.0,
        riskLevel: 'medium',
        hallucinations: [
          {
            text: 'émojis 🚀',
            type: 'Special Characters',
            confidence: 0.5,
            explanation: 'Contains special characters and émojis'
          }
        ],
        verificationSources: 5,
        processingTime: 300,
        analysisType: 'single',
        filename: 'file with spaces & symbols.txt'
      };

      const dbFormat = convertToDatabase(specialCharsResult);
      const completeDbResult: DatabaseAnalysisResult = {
        id: specialCharsResult.id,
        created_at: specialCharsResult.timestamp,
        ...dbFormat
      };
      const backToAppFormat = convertDatabaseResult(completeDbResult);

      expect(backToAppFormat).toEqual(specialCharsResult);
      expect(backToAppFormat.content).toBe('Content with "quotes", \'apostrophes\', and émojis 🚀');
      expect(backToAppFormat.filename).toBe('file with spaces & symbols.txt');
    });
  });

  describe('type safety', () => {
    it('should enforce correct risk level types', () => {
      const validRiskLevels: Array<'low' | 'medium' | 'high' | 'critical'> = 
        ['low', 'medium', 'high', 'critical'];

      validRiskLevels.forEach(riskLevel => {
        const result: AnalysisResult = {
          ...mockAnalysisResult,
          riskLevel
        };
        
        const dbFormat = convertToDatabase(result);
        expect(dbFormat.risk_level).toBe(riskLevel);
      });
    });

    it('should enforce correct analysis type types', () => {
      const validAnalysisTypes: Array<'single' | 'batch' | 'scheduled'> = 
        ['single', 'batch', 'scheduled'];

      validAnalysisTypes.forEach(analysisType => {
        const result: AnalysisResult = {
          ...mockAnalysisResult,
          analysisType
        };
        
        const dbFormat = convertToDatabase(result);
        expect(dbFormat.analysis_type).toBe(analysisType);
      });
    });
  });
});