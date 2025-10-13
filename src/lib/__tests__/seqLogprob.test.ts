import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SeqLogprobAnalyzer,
  detectHallucination,
  createTokenProbabilities,
  parseTokenizedResponse,
  analyzeSequenceConfidence,
  TokenProbability,
  HallucinationDetectionConfig
} from '../seqLogprob';

<<<<<<< HEAD
describe('SeqLogprob Hallucination Detection', () => {
  const mockTokenProbs: TokenProbability[] = [
    { token: 'The', probability: 0.9, position: 0 },
    { token: ' AI', probability: 0.8, position: 1 },
    { token: ' system', probability: 0.85, position: 2 },
    { token: ' achieves', probability: 0.7, position: 3 },
    { token: ' exactly', probability: 0.1, position: 4 }, // Low confidence
    { token: ' 99', probability: 0.05, position: 5 }, // Very low confidence
    { token: '.', probability: 0.02, position: 6 }, // Very low confidence
    { token: '7', probability: 0.03, position: 7 }, // Very low confidence
    { token: '%', probability: 0.8, position: 8 },
    { token: ' accuracy', probability: 0.9, position: 9 }
  ];

  const testText = 'The AI system achieves exactly 99.7% accuracy';

  beforeEach(() => {
=======
describe('SeqLogprobAnalyzer', () => {
  let analyzer: SeqLogprobAnalyzer;

  beforeEach(() => {
    analyzer = new SeqLogprobAnalyzer();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    vi.clearAllMocks();
  });

  afterEach(() => {
<<<<<<< HEAD
    vi.restoreAllMocks();
  });

  describe('SeqLogprobAnalyzer', () => {
    describe('constructor and configuration', () => {
      it('should initialize with default configuration', () => {
        const analyzer = new SeqLogprobAnalyzer();
        const config = analyzer.getConfig();

        expect(config.hallucinationThreshold).toBe(-2.5);
        expect(config.lowConfidenceThreshold).toBe(-3.0);
        expect(config.veryLowConfidenceThreshold).toBe(-5.0);
        expect(config.minSequenceLength).toBe(3);
        expect(config.maxLowConfidenceRatio).toBe(0.3);
        expect(config.enableSequenceAnalysis).toBe(true);
        expect(config.enableVarianceAnalysis).toBe(true);
        expect(config.enableSuspiciousPatternDetection).toBe(true);
      });

      it('should initialize with custom configuration', () => {
        const customConfig: Partial<HallucinationDetectionConfig> = {
          hallucinationThreshold: -3.0,
          lowConfidenceThreshold: -4.0,
          minSequenceLength: 5,
          enableSequenceAnalysis: false
        };

        const analyzer = new SeqLogprobAnalyzer(customConfig);
        const config = analyzer.getConfig();

        expect(config.hallucinationThreshold).toBe(-3.0);
        expect(config.lowConfidenceThreshold).toBe(-4.0);
        expect(config.minSequenceLength).toBe(5);
        expect(config.enableSequenceAnalysis).toBe(false);
        // Should keep defaults for unspecified values
        expect(config.veryLowConfidenceThreshold).toBe(-5.0);
      });

      it('should update configuration', () => {
        const analyzer = new SeqLogprobAnalyzer();
        
        analyzer.updateConfig({
          hallucinationThreshold: -2.0,
          enableVarianceAnalysis: false
        });

        const config = analyzer.getConfig();
        expect(config.hallucinationThreshold).toBe(-2.0);
        expect(config.enableVarianceAnalysis).toBe(false);
        expect(config.lowConfidenceThreshold).toBe(-3.0); // Should remain unchanged
      });
    });

    describe('detectHallucination', () => {
      it('should detect hallucination with low confidence tokens', () => {
        const analyzer = new SeqLogprobAnalyzer();
        const result = analyzer.detectHallucination(testText, mockTokenProbs);

        expect(result.isHallucinationSuspected).toBe(true);
        expect(result.hallucinationRisk).toMatch(/medium|high|critical/);
        expect(result.lowConfidenceTokens).toBeGreaterThan(0);
        expect(result.sequenceLength).toBe(mockTokenProbs.length);
        expect(result.processingTime).toBeGreaterThan(0);
      });

      it('should not detect hallucination with high confidence tokens', () => {
        const highConfidenceTokens: TokenProbability[] = [
          { token: 'The', probability: 0.9, position: 0 },
          { token: ' weather', probability: 0.85, position: 1 },
          { token: ' is', probability: 0.95, position: 2 },
          { token: ' sunny', probability: 0.8, position: 3 },
          { token: ' today', probability: 0.9, position: 4 }
        ];

        const analyzer = new SeqLogprobAnalyzer();
        const result = analyzer.detectHallucination('The weather is sunny today', highConfidenceTokens);

        expect(result.isHallucinationSuspected).toBe(false);
        expect(result.hallucinationRisk).toBe('low');
        expect(result.lowConfidenceTokens).toBe(0);
        expect(result.confidenceScore).toBeGreaterThan(70);
      });

      it('should calculate sequence metrics correctly', () => {
        const analyzer = new SeqLogprobAnalyzer();
        const result = analyzer.detectHallucination(testText, mockTokenProbs);

        expect(result.seqLogprob).toBeLessThan(0);
        expect(result.normalizedSeqLogprob).toBeLessThan(0);
        expect(result.averageLogProb).toBe(result.normalizedSeqLogprob);
        expect(result.averageConfidence).toBeGreaterThan(0);
        expect(result.averageConfidence).toBeLessThanOrEqual(1);
      });

      it('should detect suspicious sequences', () => {
        const analyzer = new SeqLogprobAnalyzer();
        const result = analyzer.detectHallucination(testText, mockTokenProbs);

        expect(result.suspiciousSequences.length).toBeGreaterThan(0);
        
        const suspiciousSequence = result.suspiciousSequences[0];
        expect(suspiciousSequence).toHaveProperty('startIndex');
        expect(suspiciousSequence).toHaveProperty('endIndex');
        expect(suspiciousSequence).toHaveProperty('tokens');
        expect(suspiciousSequence).toHaveProperty('averageLogProb');
        expect(suspiciousSequence).toHaveProperty('reason');
        expect(suspiciousSequence.tokens.length).toBeGreaterThanOrEqual(3);
      });

      it('should apply custom threshold', () => {
        const analyzer = new SeqLogprobAnalyzer();
        
        // Very strict threshold
        const strictResult = analyzer.detectHallucination(testText, mockTokenProbs, -1.0);
        expect(strictResult.threshold).toBe(-1.0);
        expect(strictResult.isHallucinationSuspected).toBe(true);

        // Very lenient threshold
        const lenientResult = analyzer.detectHallucination(testText, mockTokenProbs, -10.0);
        expect(lenientResult.threshold).toBe(-10.0);
        expect(lenientResult.isHallucinationSuspected).toBe(false);
      });

      it('should include model info when provided', () => {
        const analyzer = new SeqLogprobAnalyzer();
        const modelInfo = {
          name: 'gpt-4',
          version: '1.0',
          temperature: 0.1
        };

        const result = analyzer.detectHallucination(testText, mockTokenProbs, -2.5, modelInfo);

        expect(result.modelInfo).toEqual(modelInfo);
      });

      it('should calculate confidence variance when enabled', () => {
        const analyzer = new SeqLogprobAnalyzer({ enableVarianceAnalysis: true });
        const result = analyzer.detectHallucination(testText, mockTokenProbs);

        expect(result.confidenceVariance).toBeGreaterThan(0);
      });

      it('should skip variance calculation when disabled', () => {
        const analyzer = new SeqLogprobAnalyzer({ enableVarianceAnalysis: false });
        const result = analyzer.detectHallucination(testText, mockTokenProbs);

        expect(result.confidenceVariance).toBe(0);
      });
    });

    describe('input validation', () => {
      it('should throw error for empty text', () => {
        const analyzer = new SeqLogprobAnalyzer();

        expect(() => {
          analyzer.detectHallucination('', mockTokenProbs);
        }).toThrow('Text input must be a non-empty string');
      });

      it('should throw error for non-string text', () => {
        const analyzer = new SeqLogprobAnalyzer();

        expect(() => {
          analyzer.detectHallucination(null as any, mockTokenProbs);
        }).toThrow('Text input must be a non-empty string');
      });

      it('should throw error for empty token probabilities', () => {
        const analyzer = new SeqLogprobAnalyzer();

        expect(() => {
          analyzer.detectHallucination(testText, []);
        }).toThrow('Token probabilities must be a non-empty array');
      });

      it('should throw error for invalid token structure', () => {
        const analyzer = new SeqLogprobAnalyzer();
        const invalidTokens = [
          { token: '', probability: 0.5, position: 0 } // Empty token
        ];

        expect(() => {
          analyzer.detectHallucination(testText, invalidTokens);
        }).toThrow('Invalid token at position 0: token must be a string');
      });

      it('should throw error for invalid probability values', () => {
        const analyzer = new SeqLogprobAnalyzer();
        const invalidTokens = [
          { token: 'test', probability: 1.5, position: 0 } // Probability > 1
        ];

        expect(() => {
          analyzer.detectHallucination(testText, invalidTokens);
        }).toThrow('Invalid probability at position 0: must be between 0 and 1');
      });

      it('should throw error for negative probability', () => {
        const analyzer = new SeqLogprobAnalyzer();
        const invalidTokens = [
          { token: 'test', probability: -0.1, position: 0 }
        ];

        expect(() => {
          analyzer.detectHallucination(testText, invalidTokens);
        }).toThrow('Invalid probability at position 0: must be between 0 and 1');
      });

      it('should throw error for invalid position', () => {
        const analyzer = new SeqLogprobAnalyzer();
        const invalidTokens = [
          { token: 'test', probability: 0.5, position: -1 }
        ];

        expect(() => {
          analyzer.detectHallucination(testText, invalidTokens);
        }).toThrow('Invalid position at position 0: must be a non-negative number');
      });
    });

    describe('model adjustments', () => {
      it('should apply model-specific threshold adjustments', () => {
        const analyzer = new SeqLogprobAnalyzer({
          modelAdjustments: {
            'gpt-4': {
              thresholdAdjustment: -0.5,
              confidenceBoost: 0.1
            }
          }
        });

        const modelInfo = { name: 'gpt-4' };
        const result = analyzer.detectHallucination(testText, mockTokenProbs, -2.5, modelInfo);

        expect(result.threshold).toBe(-3.0); // -2.5 + (-0.5)
      });

      it('should not apply adjustments for unknown models', () => {
        const analyzer = new SeqLogprobAnalyzer({
          modelAdjustments: {
            'gpt-4': {
              thresholdAdjustment: -0.5,
              confidenceBoost: 0.1
            }
          }
        });

        const modelInfo = { name: 'unknown-model' };
        const result = analyzer.detectHallucination(testText, mockTokenProbs, -2.5, modelInfo);

        expect(result.threshold).toBe(-2.5); // No adjustment
      });
    });
  });

  describe('utility functions', () => {
    describe('createTokenProbabilities', () => {
      it('should create token probabilities from arrays', () => {
        const tokens = ['The', 'quick', 'brown'];
        const probabilities = [0.9, 0.8, 0.7];

        const result = createTokenProbabilities(tokens, probabilities);

        expect(result).toEqual([
          { token: 'The', probability: 0.9, position: 0 },
          { token: 'quick', probability: 0.8, position: 1 },
          { token: 'brown', probability: 0.7, position: 2 }
        ]);
      });

      it('should throw error for mismatched array lengths', () => {
        const tokens = ['The', 'quick'];
        const probabilities = [0.9, 0.8, 0.7];

        expect(() => {
          createTokenProbabilities(tokens, probabilities);
        }).toThrow('Tokens and probabilities arrays must have the same length');
      });
    });

    describe('parseTokenizedResponse', () => {
      it('should parse OpenAI API format', () => {
        const openAIResponse = {
          choices: [{
            logprobs: {
              tokens: ['The', 'quick', 'brown'],
              token_logprobs: [-0.1, -0.2, -0.3]
            }
          }]
        };

        const result = parseTokenizedResponse(openAIResponse);

        expect(result).toHaveLength(3);
        expect(result[0].token).toBe('The');
        expect(result[0].probability).toBeCloseTo(Math.exp(-0.1), 5);
        expect(result[0].position).toBe(0);
      });

      it('should parse direct format', () => {
        const directResponse = {
          tokens: ['The', 'quick'],
          logprobs: [-0.1, -0.2]
        };

        const result = parseTokenizedResponse(directResponse);

        expect(result).toHaveLength(2);
        expect(result[0].token).toBe('The');
        expect(result[0].probability).toBeCloseTo(Math.exp(-0.1), 5);
      });

      it('should throw error for unsupported format', () => {
        const unsupportedResponse = {
          data: ['some', 'data']
        };

        expect(() => {
          parseTokenizedResponse(unsupportedResponse as any);
        }).toThrow('Unsupported response format');
      });
    });

    describe('detectHallucination convenience function', () => {
      it('should work with default parameters', () => {
        const result = detectHallucination(testText, mockTokenProbs);

        expect(result.isHallucinationSuspected).toBeDefined();
        expect(result.hallucinationRisk).toBeDefined();
        expect(result.confidenceScore).toBeDefined();
        expect(result.threshold).toBe(-2.5);
      });

      it('should work with custom threshold and config', () => {
        const customConfig = { minSequenceLength: 5 };
        const result = detectHallucination(testText, mockTokenProbs, -3.0, customConfig);

        expect(result.threshold).toBe(-3.0);
      });
    });

    describe('analyzeSequenceConfidence', () => {
      it('should provide basic analysis without detailed insights', () => {
        const result = analyzeSequenceConfidence(testText, mockTokenProbs);

        expect(result.insights.mostSuspiciousToken).toBeNull();
        expect(result.insights.confidenceTrend).toBe('stable');
        expect(result.insights.recommendedActions).toEqual([]);
        expect(result.insights.technicalSummary).toBe('');
      });

      it('should provide detailed insights when requested', () => {
        const result = analyzeSequenceConfidence(testText, mockTokenProbs, {
          includeDetailedAnalysis: true
        });

        expect(result.insights.mostSuspiciousToken).toBeDefined();
        expect(result.insights.confidenceTrend).toMatch(/improving|declining|stable/);
        expect(result.insights.recommendedActions.length).toBeGreaterThan(0);
        expect(result.insights.technicalSummary.length).toBeGreaterThan(0);
      });

      it('should identify most suspicious token', () => {
        const result = analyzeSequenceConfidence(testText, mockTokenProbs, {
          includeDetailedAnalysis: true
        });

        const mostSuspicious = result.insights.mostSuspiciousToken;
        expect(mostSuspicious).not.toBeNull();
        expect(mostSuspicious!.token).toBeDefined();
        expect(mostSuspicious!.logProbability).toBeLessThan(-2.0);
        expect(mostSuspicious!.reason).toContain('probability');
      });

      it('should analyze confidence trends', () => {
        // Create tokens with declining confidence
        const decliningTokens: TokenProbability[] = [
          { token: 'Good', probability: 0.9, position: 0 },
          { token: ' start', probability: 0.8, position: 1 },
          { token: ' but', probability: 0.7, position: 2 },
          { token: ' then', probability: 0.3, position: 3 },
          { token: ' bad', probability: 0.1, position: 4 },
          { token: ' end', probability: 0.05, position: 5 }
        ];

        const result = analyzeSequenceConfidence('Good start but then bad end', decliningTokens, {
          includeDetailedAnalysis: true
        });

        expect(result.insights.confidenceTrend).toBe('declining');
      });

      it('should generate appropriate recommendations', () => {
        const result = analyzeSequenceConfidence(testText, mockTokenProbs, {
          includeDetailedAnalysis: true
        });

        const recommendations = result.insights.recommendedActions;
        expect(recommendations.length).toBeGreaterThan(0);
        
        if (result.isHallucinationSuspected) {
          expect(recommendations.some(r => r.includes('review'))).toBe(true);
        }
      });

      it('should generate technical summary', () => {
        const result = analyzeSequenceConfidence(testText, mockTokenProbs, {
          includeDetailedAnalysis: true
        });

        const summary = result.insights.technicalSummary;
        expect(summary).toContain('Seq-Logprob analysis');
        expect(summary).toContain('tokens');
        expect(summary).toContain('probability');
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle very small probabilities', () => {
      const verySmallProbTokens: TokenProbability[] = [
        { token: 'test', probability: 1e-10, position: 0 }
      ];

      const analyzer = new SeqLogprobAnalyzer();
      const result = analyzer.detectHallucination('test', verySmallProbTokens);

      expect(result.isHallucinationSuspected).toBe(true);
      expect(result.hallucinationRisk).toBe('critical');
    });

    it('should handle zero probability gracefully', () => {
      const zeroProbTokens: TokenProbability[] = [
        { token: 'test', probability: 0, position: 0 }
      ];

      const analyzer = new SeqLogprobAnalyzer();
      
      expect(() => {
        analyzer.detectHallucination('test', zeroProbTokens);
      }).not.toThrow();
    });

    it('should handle single token input', () => {
      const singleToken: TokenProbability[] = [
        { token: 'test', probability: 0.5, position: 0 }
      ];

      const analyzer = new SeqLogprobAnalyzer();
      const result = analyzer.detectHallucination('test', singleToken);

      expect(result.sequenceLength).toBe(1);
      expect(result.suspiciousSequences).toHaveLength(0); // Below minSequenceLength
    });

    it('should handle very long sequences', () => {
      const longTokens: TokenProbability[] = Array.from({ length: 1000 }, (_, i) => ({
        token: `token${i}`,
        probability: 0.8,
        position: i
      }));

      const analyzer = new SeqLogprobAnalyzer();
      const result = analyzer.detectHallucination('long text', longTokens);

      expect(result.sequenceLength).toBe(1000);
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should handle tokens with log probabilities', () => {
      const tokensWithLogProbs: TokenProbability[] = [
        { token: 'test', probability: 0.8, logProbability: -0.223, position: 0 }
      ];

      const analyzer = new SeqLogprobAnalyzer();
      const result = analyzer.detectHallucination('test', tokensWithLogProbs);

      expect(result.tokenAnalysis[0].logProbability).toBeCloseTo(Math.log(0.8), 3);
    });
  });

  describe('performance', () => {
    it('should complete analysis within reasonable time', () => {
      const largeTokenSet: TokenProbability[] = Array.from({ length: 500 }, (_, i) => ({
        token: `token${i}`,
        probability: Math.random() * 0.5 + 0.25, // Random between 0.25 and 0.75
        position: i
      }));

      const analyzer = new SeqLogprobAnalyzer();
      const startTime = Date.now();
      
      const result = analyzer.detectHallucination('large text sequence', largeTokenSet);
      
      const actualTime = Date.now() - startTime;
      
      expect(result.processingTime).toBeLessThan(1000); // Should complete within 1 second
      expect(actualTime).toBeLessThan(2000); // Actual time should also be reasonable
    });
=======
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const config = analyzer.getConfig();
      
      expect(config.hallucinationThreshold).toBe(-2.5);
      expect(config.lowConfidenceThreshold).toBe(-3.0);
      expect(config.veryLowConfidenceThreshold).toBe(-5.0);
      expect(config.minSequenceLength).toBe(3);
      expect(config.maxLowConfidenceRatio).toBe(0.3);
      expect(config.enableSequenceAnalysis).toBe(true);
      expect(config.enableVarianceAnalysis).toBe(true);
      expect(config.enableSuspiciousPatternDetection).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customConfig: Partial<HallucinationDetectionConfig> = {
        hallucinationThreshold: -3.0,
        lowConfidenceThreshold: -4.0,
        enableSequenceAnalysis: false
      };

      const customAnalyzer = new SeqLogprobAnalyzer(customConfig);
      const config = customAnalyzer.getConfig();

      expect(config.hallucinationThreshold).toBe(-3.0);
      expect(config.lowConfidenceThreshold).toBe(-4.0);
      expect(config.enableSequenceAnalysis).toBe(false);
      expect(config.veryLowConfidenceThreshold).toBe(-5.0); // Should keep default
    });
  });

  describe('detectHallucination', () => {
    const mockText = 'This AI system achieves exactly 99.7% accuracy with zero false positives.';
    const mockTokenProbs: TokenProbability[] = [
      { token: 'This', probability: 0.9, position: 0 },
      { token: ' AI', probability: 0.8, position: 4 },
      { token: ' system', probability: 0.85, position: 7 },
      { token: ' achieves', probability: 0.7, position: 14 },
      { token: ' exactly', probability: 0.1, position: 23 }, // Low confidence
      { token: ' 99.7%', probability: 0.05, position: 31 }, // Very low confidence
      { token: ' accuracy', probability: 0.6, position: 37 },
      { token: ' with', probability: 0.9, position: 46 },
      { token: ' zero', probability: 0.2, position: 51 }, // Low confidence
      { token: ' false', probability: 0.3, position: 56 },
      { token: ' positives', probability: 0.4, position: 62 }
    ];

    it('should detect hallucination with low confidence tokens', () => {
      const result = analyzer.detectHallucination(mockText, mockTokenProbs);

      expect(result.isHallucinationSuspected).toBe(true);
      expect(result.hallucinationRisk).toMatch(/high|critical/);
      expect(result.lowConfidenceTokens).toBeGreaterThan(0);
      expect(result.sequenceLength).toBe(mockTokenProbs.length);
      expect(result.confidenceScore).toBeLessThan(70);
    });

    it('should not detect hallucination with high confidence tokens', () => {
      const highConfidenceTokens: TokenProbability[] = [
        { token: 'The', probability: 0.95, position: 0 },
        { token: ' weather', probability: 0.9, position: 3 },
        { token: ' is', probability: 0.98, position: 11 },
        { token: ' nice', probability: 0.85, position: 14 },
        { token: ' today', probability: 0.8, position: 19 }
      ];

      const result = analyzer.detectHallucination('The weather is nice today', highConfidenceTokens);

      expect(result.isHallucinationSuspected).toBe(false);
      expect(result.hallucinationRisk).toBe('low');
      expect(result.lowConfidenceTokens).toBe(0);
      expect(result.confidenceScore).toBeGreaterThan(70);
    });

    it('should use custom threshold when provided', () => {
      const customThreshold = -1.5;
      const result = analyzer.detectHallucination(mockText, mockTokenProbs, customThreshold);

      expect(result.threshold).toBe(customThreshold);
    });

    it('should include model info when provided', () => {
      const modelInfo = {
        name: 'gpt-4',
        version: '1.0',
        temperature: 0.1
      };

      const result = analyzer.detectHallucination(mockText, mockTokenProbs, undefined, modelInfo);

      expect(result.modelInfo).toEqual(modelInfo);
    });

    it('should calculate processing time', () => {
      const result = analyzer.detectHallucination(mockText, mockTokenProbs);

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTime).toBe('number');
    });

    it('should detect suspicious sequences', () => {
      const result = analyzer.detectHallucination(mockText, mockTokenProbs);

      expect(result.suspiciousSequences).toBeDefined();
      expect(Array.isArray(result.suspiciousSequences)).toBe(true);
      
      if (result.suspiciousSequences.length > 0) {
        const sequence = result.suspiciousSequences[0];
        expect(sequence).toHaveProperty('startIndex');
        expect(sequence).toHaveProperty('endIndex');
        expect(sequence).toHaveProperty('tokens');
        expect(sequence).toHaveProperty('averageLogProb');
        expect(sequence).toHaveProperty('reason');
      }
    });

    it('should calculate confidence variance', () => {
      const result = analyzer.detectHallucination(mockText, mockTokenProbs);

      expect(result.confidenceVariance).toBeGreaterThanOrEqual(0);
      expect(typeof result.confidenceVariance).toBe('number');
    });

    it('should categorize token confidence levels', () => {
      const result = analyzer.detectHallucination(mockText, mockTokenProbs);

      result.tokenAnalysis.forEach(token => {
        expect(['high', 'medium', 'low', 'very_low']).toContain(token.confidenceLevel);
        expect(typeof token.isLowConfidence).toBe('boolean');
        expect(typeof token.logProbability).toBe('number');
      });
    });
  });

  describe('input validation', () => {
    it('should throw error for empty text', () => {
      const tokenProbs: TokenProbability[] = [
        { token: 'test', probability: 0.5, position: 0 }
      ];

      expect(() => {
        analyzer.detectHallucination('', tokenProbs);
      }).toThrow('Text input must be a non-empty string');
    });

    it('should throw error for non-string text', () => {
      const tokenProbs: TokenProbability[] = [
        { token: 'test', probability: 0.5, position: 0 }
      ];

      expect(() => {
        analyzer.detectHallucination(null as any, tokenProbs);
      }).toThrow('Text input must be a non-empty string');
    });

    it('should throw error for empty token probabilities', () => {
      expect(() => {
        analyzer.detectHallucination('test text', []);
      }).toThrow('Token probabilities must be a non-empty array');
    });

    it('should throw error for invalid token structure', () => {
      const invalidTokens = [
        { token: '', probability: 0.5, position: 0 } // Empty token
      ];

      expect(() => {
        analyzer.detectHallucination('test', invalidTokens);
      }).toThrow('Invalid token at position 0');
    });

    it('should throw error for invalid probability values', () => {
      const invalidTokens = [
        { token: 'test', probability: 1.5, position: 0 } // Probability > 1
      ];

      expect(() => {
        analyzer.detectHallucination('test', invalidTokens);
      }).toThrow('Invalid probability at position 0');
    });

    it('should throw error for negative position', () => {
      const invalidTokens = [
        { token: 'test', probability: 0.5, position: -1 }
      ];

      expect(() => {
        analyzer.detectHallucination('test', invalidTokens);
      }).toThrow('Invalid position at position 0');
    });

    it('should warn for mismatched token lengths', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const tokenProbs: TokenProbability[] = [
        { token: 'verylongtoken', probability: 0.5, position: 0 }
      ];

      analyzer.detectHallucination('short', tokenProbs);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Token lengths do not closely match input text length')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('model adjustments', () => {
    it('should apply model-specific threshold adjustments', () => {
      const configWithAdjustments: Partial<HallucinationDetectionConfig> = {
        modelAdjustments: {
          'gpt-4': {
            thresholdAdjustment: -0.5,
            confidenceBoost: 0.1
          }
        }
      };

      const customAnalyzer = new SeqLogprobAnalyzer(configWithAdjustments);
      const tokenProbs: TokenProbability[] = [
        { token: 'test', probability: 0.5, position: 0 }
      ];

      const result = customAnalyzer.detectHallucination(
        'test',
        tokenProbs,
        -2.5,
        { name: 'gpt-4' }
      );

      expect(result.threshold).toBe(-3.0); // -2.5 + (-0.5)
    });

    it('should not apply adjustments for unknown models', () => {
      const configWithAdjustments: Partial<HallucinationDetectionConfig> = {
        modelAdjustments: {
          'gpt-4': {
            thresholdAdjustment: -0.5,
            confidenceBoost: 0.1
          }
        }
      };

      const customAnalyzer = new SeqLogprobAnalyzer(configWithAdjustments);
      const tokenProbs: TokenProbability[] = [
        { token: 'test', probability: 0.5, position: 0 }
      ];

      const result = customAnalyzer.detectHallucination(
        'test',
        tokenProbs,
        -2.5,
        { name: 'unknown-model' }
      );

      expect(result.threshold).toBe(-2.5); // No adjustment
    });
  });

  describe('configuration management', () => {
    it('should update configuration', () => {
      const newConfig: Partial<HallucinationDetectionConfig> = {
        hallucinationThreshold: -3.5,
        enableSequenceAnalysis: false
      };

      analyzer.updateConfig(newConfig);
      const config = analyzer.getConfig();

      expect(config.hallucinationThreshold).toBe(-3.5);
      expect(config.enableSequenceAnalysis).toBe(false);
      expect(config.lowConfidenceThreshold).toBe(-3.0); // Should remain unchanged
    });

    it('should return copy of configuration', () => {
      const config1 = analyzer.getConfig();
      const config2 = analyzer.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });
  });
});

describe('utility functions', () => {
  describe('detectHallucination', () => {
    it('should work as convenience function', () => {
      const text = 'Test text';
      const tokenProbs: TokenProbability[] = [
        { token: 'Test', probability: 0.9, position: 0 },
        { token: ' text', probability: 0.8, position: 4 }
      ];

      const result = detectHallucination(text, tokenProbs);

      expect(result).toHaveProperty('isHallucinationSuspected');
      expect(result).toHaveProperty('hallucinationRisk');
      expect(result).toHaveProperty('confidenceScore');
    });

    it('should accept custom threshold and config', () => {
      const text = 'Test text';
      const tokenProbs: TokenProbability[] = [
        { token: 'Test', probability: 0.9, position: 0 },
        { token: ' text', probability: 0.8, position: 4 }
      ];

      const customConfig: Partial<HallucinationDetectionConfig> = {
        enableSequenceAnalysis: false
      };

      const result = detectHallucination(text, tokenProbs, -3.0, customConfig);

      expect(result.threshold).toBe(-3.0);
    });
  });

  describe('createTokenProbabilities', () => {
    it('should create token probabilities from arrays', () => {
      const tokens = ['Hello', ' world', '!'];
      const probabilities = [0.9, 0.8, 0.7];

      const result = createTokenProbabilities(tokens, probabilities);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        token: 'Hello',
        probability: 0.9,
        position: 0
      });
      expect(result[1]).toEqual({
        token: ' world',
        probability: 0.8,
        position: 1
      });
      expect(result[2]).toEqual({
        token: '!',
        probability: 0.7,
        position: 2
      });
    });

    it('should throw error for mismatched array lengths', () => {
      const tokens = ['Hello', 'world'];
      const probabilities = [0.9];

      expect(() => {
        createTokenProbabilities(tokens, probabilities);
      }).toThrow('Tokens and probabilities arrays must have the same length');
    });
  });

  describe('parseTokenizedResponse', () => {
    it('should parse OpenAI API format', () => {
      const openAIResponse = {
        choices: [{
          logprobs: {
            tokens: ['Hello', ' world'],
            token_logprobs: [-0.1, -0.2]
          }
        }]
      };

      const result = parseTokenizedResponse(openAIResponse);

      expect(result).toHaveLength(2);
      expect(result[0].token).toBe('Hello');
      expect(result[0].probability).toBeCloseTo(Math.exp(-0.1), 5);
      expect(result[1].token).toBe(' world');
      expect(result[1].probability).toBeCloseTo(Math.exp(-0.2), 5);
    });

    it('should parse direct format', () => {
      const directResponse = {
        tokens: ['Hello', ' world'],
        logprobs: [-0.1, -0.2]
      };

      const result = parseTokenizedResponse(directResponse);

      expect(result).toHaveLength(2);
      expect(result[0].token).toBe('Hello');
      expect(result[0].probability).toBeCloseTo(Math.exp(-0.1), 5);
    });

    it('should throw error for unsupported format', () => {
      const unsupportedResponse = {
        data: 'unsupported'
      };

      expect(() => {
        parseTokenizedResponse(unsupportedResponse as any);
      }).toThrow('Unsupported response format');
    });
  });

  describe('analyzeSequenceConfidence', () => {
    const mockText = 'Test text with potential issues';
    const mockTokenProbs: TokenProbability[] = [
      { token: 'Test', probability: 0.9, position: 0 },
      { token: ' text', probability: 0.8, position: 4 },
      { token: ' with', probability: 0.7, position: 9 },
      { token: ' potential', probability: 0.1, position: 14 }, // Low confidence
      { token: ' issues', probability: 0.2, position: 24 } // Low confidence
    ];

    it('should provide basic analysis without detailed insights', () => {
      const result = analyzeSequenceConfidence(mockText, mockTokenProbs);

      expect(result).toHaveProperty('isHallucinationSuspected');
      expect(result).toHaveProperty('insights');
      expect(result.insights.mostSuspiciousToken).toBe(null);
      expect(result.insights.confidenceTrend).toBe('stable');
      expect(result.insights.recommendedActions).toEqual([]);
      expect(result.insights.technicalSummary).toBe('');
    });

    it('should provide detailed insights when requested', () => {
      const result = analyzeSequenceConfidence(mockText, mockTokenProbs, {
        includeDetailedAnalysis: true
      });

      expect(result.insights.mostSuspiciousToken).toBeDefined();
      expect(['improving', 'declining', 'stable']).toContain(result.insights.confidenceTrend);
      expect(Array.isArray(result.insights.recommendedActions)).toBe(true);
      expect(typeof result.insights.technicalSummary).toBe('string');
    });

    it('should accept custom options', () => {
      const options = {
        threshold: -3.0,
        includeDetailedAnalysis: true,
        modelInfo: { name: 'test-model' },
        config: { enableSequenceAnalysis: false }
      };

      const result = analyzeSequenceConfidence(mockText, mockTokenProbs, options);

      expect(result.threshold).toBe(-3.0);
      expect(result.modelInfo?.name).toBe('test-model');
    });

    it('should find most suspicious token', () => {
      const result = analyzeSequenceConfidence(mockText, mockTokenProbs, {
        includeDetailedAnalysis: true
      });

      if (result.insights.mostSuspiciousToken) {
        expect(result.insights.mostSuspiciousToken.token).toBe(' potential');
        expect(result.insights.mostSuspiciousToken.logProbability).toBeLessThan(-2);
        expect(result.insights.mostSuspiciousToken.reason).toContain('potential hallucination');
      }
    });

    it('should analyze confidence trend', () => {
      // Create tokens with declining confidence
      const decliningTokens: TokenProbability[] = [
        { token: 'Good', probability: 0.9, position: 0 },
        { token: ' start', probability: 0.8, position: 4 },
        { token: ' but', probability: 0.7, position: 10 },
        { token: ' declining', probability: 0.3, position: 14 },
        { token: ' confidence', probability: 0.1, position: 24 }
      ];

      const result = analyzeSequenceConfidence('Good start but declining confidence', decliningTokens, {
        includeDetailedAnalysis: true
      });

      expect(result.insights.confidenceTrend).toBe('declining');
    });

    it('should generate appropriate recommendations', () => {
      const lowConfidenceTokens: TokenProbability[] = [
        { token: 'Very', probability: 0.05, position: 0 },
        { token: ' suspicious', probability: 0.03, position: 4 },
        { token: ' content', probability: 0.02, position: 14 },
        { token: ' here', probability: 0.01, position: 22 }
      ];

      const result = analyzeSequenceConfidence('Very suspicious content here', lowConfidenceTokens, {
        includeDetailedAnalysis: true
      });

      expect(result.insights.recommendedActions.length).toBeGreaterThan(0);
      expect(result.insights.recommendedActions.some(action => 
        action.includes('Manual review') || action.includes('fact-checking')
      )).toBe(true);
    });

    it('should generate technical summary', () => {
      const result = analyzeSequenceConfidence(mockText, mockTokenProbs, {
        includeDetailedAnalysis: true
      });

      expect(result.insights.technicalSummary).toContain('Seq-Logprob analysis');
      expect(result.insights.technicalSummary).toContain('tokens');
      expect(result.insights.technicalSummary).toContain('probability');
    });
  });
});

describe('edge cases and error handling', () => {
  let analyzer: SeqLogprobAnalyzer;

  beforeEach(() => {
    analyzer = new SeqLogprobAnalyzer();
  });

  it('should handle very small probabilities', () => {
    const tokenProbs: TokenProbability[] = [
      { token: 'test', probability: 1e-10, position: 0 }
    ];

    const result = analyzer.detectHallucination('test', tokenProbs);

    expect(result.tokenAnalysis[0].logProbability).toBeLessThan(-20);
    expect(result.isHallucinationSuspected).toBe(true);
  });

  it('should handle single token input', () => {
    const tokenProbs: TokenProbability[] = [
      { token: 'test', probability: 0.5, position: 0 }
    ];

    const result = analyzer.detectHallucination('test', tokenProbs);

    expect(result.sequenceLength).toBe(1);
    expect(result.tokenAnalysis).toHaveLength(1);
  });

  it('should handle all high confidence tokens', () => {
    const tokenProbs: TokenProbability[] = [
      { token: 'The', probability: 0.99, position: 0 },
      { token: ' cat', probability: 0.98, position: 3 },
      { token: ' sat', probability: 0.97, position: 7 }
    ];

    const result = analyzer.detectHallucination('The cat sat', tokenProbs);

    expect(result.isHallucinationSuspected).toBe(false);
    expect(result.hallucinationRisk).toBe('low');
    expect(result.lowConfidenceTokens).toBe(0);
  });

  it('should handle disabled features', () => {
    const config: Partial<HallucinationDetectionConfig> = {
      enableSequenceAnalysis: false,
      enableVarianceAnalysis: false,
      enableSuspiciousPatternDetection: false
    };

    const customAnalyzer = new SeqLogprobAnalyzer(config);
    const tokenProbs: TokenProbability[] = [
      { token: 'test', probability: 0.1, position: 0 },
      { token: ' low', probability: 0.05, position: 4 },
      { token: ' confidence', probability: 0.02, position: 8 }
    ];

    const result = customAnalyzer.detectHallucination('test low confidence', tokenProbs);

    expect(result.confidenceVariance).toBe(0);
    expect(result.suspiciousSequences).toEqual([]);
  });

  it('should handle extreme threshold values', () => {
    const tokenProbs: TokenProbability[] = [
      { token: 'test', probability: 0.5, position: 0 }
    ];

    // Very strict threshold
    const strictResult = analyzer.detectHallucination('test', tokenProbs, -0.1);
    expect(strictResult.isHallucinationSuspected).toBe(true);

    // Very lenient threshold
    const lenientResult = analyzer.detectHallucination('test', tokenProbs, -10.0);
    expect(lenientResult.isHallucinationSuspected).toBe(false);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  });
});